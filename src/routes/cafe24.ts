import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  CAFE24_CLIENT_ID: string;
  CAFE24_CLIENT_SECRET: string;
};

const cafe24 = new Hono<{ Bindings: Bindings }>();

// ============================================
// 1. OAuth 설치 시작 - 사용자를 카페24 인증 페이지로 리다이렉트
// ============================================
cafe24.get("/install", (c) => {
  const mall_id = c.req.query("mall_id");
  const tenant_id = c.req.query("tenant_id") || "default";

  if (!mall_id) {
    return c.json({ error: "mall_id query parameter is required" }, 400);
  }

  const clientId = c.env.CAFE24_CLIENT_ID;
  const redirectUri = `${new URL(c.req.url).origin}/api/cafe24/callback`;
  const scope = [
    "mall.read_application",
    "mall.read_product",
    "mall.read_category",
    "mall.read_order",
    "mall.read_shipping",
    "mall.read_customer",
    "mall.read_community",
  ].join(",");

  // state에 tenant_id와 mall_id를 인코딩 (callback에서 사용)
  const state = btoa(JSON.stringify({ tenant_id, mall_id }));

  const authUrl =
    `https://${mall_id}.cafe24api.com/api/v2/oauth/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}`;

  return c.redirect(authUrl);
});

// ============================================
// 2. OAuth 콜백 - 코드를 토큰으로 교환하고 DB에 저장
// ============================================
cafe24.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state parameter" }, 400);
  }

  let tenant_id: string;
  let mall_id: string;
  try {
    const decoded = JSON.parse(atob(state));
    tenant_id = decoded.tenant_id;
    mall_id = decoded.mall_id;
  } catch (e) {
    return c.json({ error: "Invalid state parameter" }, 400);
  }

  const clientId = c.env.CAFE24_CLIENT_ID;
  const clientSecret = c.env.CAFE24_CLIENT_SECRET;
  const redirectUri = `${new URL(c.req.url).origin}/api/cafe24/callback`;

  // Basic 인증 헤더 생성
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  // 토큰 교환 요청
  const tokenRes = await fetch(
    `https://${mall_id}.cafe24api.com/api/v2/oauth/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    }
  );

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return c.json(
      {
        error: "Token exchange failed",
        status: tokenRes.status,
        detail: errText,
      },
      500
    );
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: string;
    refresh_token_expires_at: string;
    scopes: string[];
    user_id: string;
    shop_no: number;
  };

  const now = Date.now();
  const expiresAt = new Date(tokenData.expires_at).getTime();
  const refreshExpiresAt = new Date(
    tokenData.refresh_token_expires_at
  ).getTime();

  // DB에 토큰 저장 (UPSERT)
  await c.env.DB.prepare(
    `INSERT INTO cafe24_tokens 
     (tenant_id, mall_id, access_token, refresh_token, expires_at, 
      refresh_token_expires_at, scope, user_id, shop_no, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, mall_id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       refresh_token_expires_at = excluded.refresh_token_expires_at,
       scope = excluded.scope,
       user_id = excluded.user_id,
       shop_no = excluded.shop_no,
       updated_at = excluded.updated_at`
  )
    .bind(
      tenant_id,
      mall_id,
      tokenData.access_token,
      tokenData.refresh_token,
      expiresAt,
      refreshExpiresAt,
      Array.isArray(tokenData.scopes)
        ? tokenData.scopes.join(",")
        : String(tokenData.scopes || ""),
      tokenData.user_id || null,
      tokenData.shop_no || 1,
      now,
      now
    )
    .run();

  return c.html(`
    <html>
      <head><meta charset="utf-8"><title>카페24 연동 완료</title></head>
      <body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h1>✅ 카페24 연동이 완료되었습니다!</h1>
        <p><strong>Mall ID:</strong> ${mall_id}</p>
        <p><strong>Tenant ID:</strong> ${tenant_id}</p>
        <p><strong>만료 시각:</strong> ${new Date(expiresAt).toLocaleString("ko-KR")}</p>
        <p style="margin-top: 30px;">이 창을 닫아도 됩니다.</p>
      </body>
    </html>
  `);
});

// ============================================
// 3. 유효한 Access Token 가져오기 (자동 갱신 포함)
// ============================================
async function getValidAccessToken(
  db: D1Database,
  clientId: string,
  clientSecret: string,
  tenant_id: string,
  mall_id: string
): Promise<string> {
  const row = await db
    .prepare(
      `SELECT access_token, refresh_token, expires_at, refresh_token_expires_at
       FROM cafe24_tokens WHERE tenant_id = ? AND mall_id = ?`
    )
    .bind(tenant_id, mall_id)
    .first<{
      access_token: string;
      refresh_token: string;
      expires_at: number;
      refresh_token_expires_at: number;
    }>();

  if (!row) {
    throw new Error(
      `No token found for tenant=${tenant_id}, mall=${mall_id}. Please install the app first.`
    );
  }

  const now = Date.now();
  // 만료 5분 전이면 갱신
  if (row.expires_at - now > 5 * 60 * 1000) {
    return row.access_token;
  }

  // refresh_token도 만료된 경우
  if (row.refresh_token_expires_at < now) {
    throw new Error(
      "Refresh token expired. Please re-install the app via /api/cafe24/install"
    );
  }

  // 토큰 갱신
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const refreshRes = await fetch(
    `https://${mall_id}.cafe24api.com/api/v2/oauth/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.refresh_token,
      }).toString(),
    }
  );

  if (!refreshRes.ok) {
    const errText = await refreshRes.text();
    throw new Error(`Token refresh failed: ${errText}`);
  }

  const newToken = (await refreshRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: string;
    refresh_token_expires_at: string;
  };

  const newExpiresAt = new Date(newToken.expires_at).getTime();
  const newRefreshExpiresAt = new Date(
    newToken.refresh_token_expires_at
  ).getTime();

  await db
    .prepare(
      `UPDATE cafe24_tokens 
       SET access_token = ?, refresh_token = ?, expires_at = ?, 
           refresh_token_expires_at = ?, updated_at = ?
       WHERE tenant_id = ? AND mall_id = ?`
    )
    .bind(
      newToken.access_token,
      newToken.refresh_token,
      newExpiresAt,
      newRefreshExpiresAt,
      Date.now(),
      tenant_id,
      mall_id
    )
    .run();

  return newToken.access_token;
}

// ============================================
// 4. 테스트 엔드포인트 - 상품 목록 조회
// ============================================
cafe24.get("/test/products", async (c) => {
  const tenant_id = c.req.query("tenant_id") || "default";
  const mall_id = c.req.query("mall_id");

  if (!mall_id) {
    return c.json({ error: "mall_id query parameter is required" }, 400);
  }

  try {
    const accessToken = await getValidAccessToken(
      c.env.DB,
      c.env.CAFE24_CLIENT_ID,
      c.env.CAFE24_CLIENT_SECRET,
      tenant_id,
      mall_id
    );

    const apiRes = await fetch(
      `https://${mall_id}.cafe24api.com/api/v2/admin/products?limit=5`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Cafe24-Api-Version": "2025-03-01",
        },
      }
    );

    const data = await apiRes.json();
    return c.json({ success: true, data });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 5. 테스트 엔드포인트 - 주문 목록 조회
// ============================================
cafe24.get("/test/orders", async (c) => {
  const tenant_id = c.req.query("tenant_id") || "default";
  const mall_id = c.req.query("mall_id");

  if (!mall_id) {
    return c.json({ error: "mall_id query parameter is required" }, 400);
  }

  try {
    const accessToken = await getValidAccessToken(
      c.env.DB,
      c.env.CAFE24_CLIENT_ID,
      c.env.CAFE24_CLIENT_SECRET,
      tenant_id,
      mall_id
    );

    // 최근 30일 주문
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const apiRes = await fetch(
      `https://${mall_id}.cafe24api.com/api/v2/admin/orders` +
        `?start_date=${startDate}&end_date=${endDate}&limit=5`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Cafe24-Api-Version": "2025-03-01",
        },
      }
    );

    const data = await apiRes.json();
    return c.json({ success: true, data });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================
// 6. 연동 상태 확인
// ============================================
cafe24.get("/status", async (c) => {
  const tenant_id = c.req.query("tenant_id") || "default";
  const mall_id = c.req.query("mall_id");

  if (!mall_id) {
    return c.json({ error: "mall_id query parameter is required" }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT mall_id, expires_at, refresh_token_expires_at, scope, user_id, shop_no, updated_at
     FROM cafe24_tokens WHERE tenant_id = ? AND mall_id = ?`
  )
    .bind(tenant_id, mall_id)
    .first<any>();

  if (!row) {
    return c.json({ connected: false, message: "Not connected" });
  }

  const now = Date.now();
  return c.json({
    connected: true,
    mall_id: row.mall_id,
    user_id: row.user_id,
    shop_no: row.shop_no,
    scope: row.scope,
    access_token_valid: row.expires_at > now,
    refresh_token_valid: row.refresh_token_expires_at > now,
    expires_at: new Date(row.expires_at).toISOString(),
    refresh_token_expires_at: new Date(
      row.refresh_token_expires_at
    ).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  });
});

export default cafe24;
