function getTenant(): "OURIM" | "MDL" {
  const domain = process.env.NEXT_PUBLIC_MAIL_DOMAIN ?? "mdl.kr";
  return domain.includes("ourim") ? "OURIM" : "MDL";
}

export async function insertWpUser({
  userLogin,
  userPass,
  userEmail,
  displayName,
}: {
  userLogin: string;
  userPass: string;
  userEmail: string;
  displayName: string;
}): Promise<number> {
  const tenant = getTenant();
  const apiUrl = process.env[`${tenant}_WP_API_URL`];
  const apiSecret = process.env[`${tenant}_WP_API_SECRET`];

  if (!apiUrl || !apiSecret) {
    throw new Error(`${tenant}_WP_API_URL 또는 ${tenant}_WP_API_SECRET 환경변수 없음`);
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mailer-Secret": apiSecret,
    },
    body: JSON.stringify({ userLogin, userPass, userEmail, displayName }),
  });

  const body = await res.json() as { ok?: boolean; userId?: number; error?: string; note?: string };

  if (!res.ok || body.error) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return body.userId ?? 0;
}
