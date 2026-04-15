import mysql from "mysql2/promise";

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
  const conn = await mysql.createConnection({
    host: process.env[`${tenant}_WP_DB_HOST`],
    port: Number(process.env[`${tenant}_WP_DB_PORT`] ?? 3306),
    database: process.env[`${tenant}_WP_DB_NAME`],
    user: process.env[`${tenant}_WP_DB_USER`],
    password: process.env[`${tenant}_WP_DB_PASS`],
  });

  try {
    const [result] = await conn.execute(
      `INSERT INTO wp_users
       (user_login, user_pass, user_nicename, user_email, user_url, user_registered, user_activation_key, user_status, display_name)
       VALUES (?, ?, ?, ?, '', NOW(), '', 0, ?)`,
      [userLogin, userPass, userLogin, userEmail, displayName]
    );
    const userId = (result as mysql.OkPacket).insertId;

    await conn.execute(
      `INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES (?, ?, ?), (?, ?, ?)`,
      [
        userId, "wp_capabilities", 'a:1:{s:10:"subscriber";b:1;}',
        userId, "wp_user_level", "0",
      ]
    );

    return userId;
  } finally {
    await conn.end();
  }
}
