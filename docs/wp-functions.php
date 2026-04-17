
// ── 로그인 페이지 커스터마이징 ───────────────────────────────────────────────
add_action('login_enqueue_scripts', function () {
    ?>
    <style>
        body.login {
            background: #f4f4f5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #login h1 a {
            background-image: url('https://img.scnd.kr/ourim_logo.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            width: 180px;
            height: 56px;
            display: block;
            margin: 0 auto;
        }
        #loginform, #lostpasswordform {
            background: #ffffff;
            border: 1px solid #e4e4e7;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,.06);
            padding: 28px 28px 24px;
            margin-top: 12px;
        }
        #loginform label, #lostpasswordform label {
            font-size: 12px;
            font-weight: 500;
            color: #71717a;
        }
        #loginform input[type=text],
        #loginform input[type=password],
        #loginform input[type=email],
        #lostpasswordform input[type=text],
        #lostpasswordform input[type=email] {
            background: #fafafa;
            border: 1px solid #e4e4e7;
            border-radius: 8px;
            box-shadow: none;
            color: #18181b;
            font-size: 14px;
            height: 40px;
            padding: 0 12px;
            width: 100%;
            box-sizing: border-box;
            transition: border-color .15s;
        }
        #loginform input[type=text]:focus,
        #loginform input[type=password]:focus,
        #lostpasswordform input[type=text]:focus,
        #lostpasswordform input[type=email]:focus {
            border-color: #71717a;
            box-shadow: none;
            outline: none;
        }
        #loginform .button-primary,
        #lostpasswordform .button-primary {
            background: #18181b;
            border: none;
            border-radius: 8px;
            box-shadow: none;
            color: #fff;
            font-size: 14px;
            font-weight: 500;
            height: 40px;
            width: 100%;
            text-shadow: none;
            transition: background .15s;
            cursor: pointer;
        }
        #loginform .button-primary:hover,
        #lostpasswordform .button-primary:hover {
            background: #3f3f46;
            box-shadow: none;
        }
        #loginform .button-primary:focus,
        #lostpasswordform .button-primary:focus {
            box-shadow: 0 0 0 2px #71717a;
            outline: none;
        }
        .caps-lock-warning, #login .caps-lock-warning { display: none !important; }
        #login_error, .message {
            border-radius: 8px;
            font-size: 13px;
            padding: 10px 14px;
            margin-bottom: 12px;
        }
        #login_error { border-left: 3px solid #ef4444; background: #fef2f2; color: #b91c1c; }
        .message { border-left: 3px solid #18181b; }
        #nav, #backtoblog { text-align: center; margin-top: 16px; }
        #nav a, #backtoblog a { color: #a1a1aa; font-size: 12px; text-decoration: none; }
        #nav a:hover, #backtoblog a:hover { color: #52525b; }
        .wp-pwd .wp-hide-pw { background: transparent; border: none; color: #a1a1aa; box-shadow: none; padding: 0 8px; }
        .wp-pwd .wp-hide-pw:hover { color: #52525b; }
        .wp-pwd .wp-hide-pw:focus { box-shadow: none; outline: none; }
        .forgetmenot label { color: #71717a; font-size: 13px; }
        #login { width: 340px; padding: 20px 0; }
        #login h1 a:focus { box-shadow: none; outline: none; }
    </style>
    <?php
});
add_filter('login_headerurl',  fn() => home_url());
add_filter('login_headertext', fn() => 'ourim.kr');

// ── Firebase Auth 연동 로그인 ─────────────────────────────────────────────────
// WP 기본 비밀번호 인증 완전 비활성화 — Firebase Auth만 허용
remove_filter('authenticate', 'wp_authenticate_username_password', 20);
remove_filter('authenticate', 'wp_authenticate_email_password',    20);

// 로그인 URL을 /manage 로 변경 (wp-login.php 직접 접근 차단과 쌍)
add_filter('login_url',         function() { return home_url('/manage'); }, 10, 0);
add_filter('login_action_url',  function() { return home_url('/manage'); }, 10, 0);
add_filter('logout_url',        function($url) { return add_query_arg('action', 'logout', home_url('/manage')); }, 10, 1);

define('FIREBASE_API_KEY', 'AIzaSyB7YGie98rhJNHRoQritGBEyM15WtGq6A4');
define('FIREBASE_MAIL_DOMAIN', 'ourim.kr');

add_filter('authenticate', function ($user, $username, $password) {
    if (empty($username) || empty($password)) {
        return $user;
    }

    // 로컬파트만 허용 — @ 포함 입력은 거부
    if (strpos($username, '@') !== false) {
        return new WP_Error('invalid_username', '아이디만 입력하세요. (@ourim.kr 제외)');
    }

    $wp_login = $username;
    $email    = $username . '@' . FIREBASE_MAIL_DOMAIN;

    // WP 계정이 먼저 존재해야 함 — 없으면 로그인 거부 (자동 생성 없음)
    $wp_user = get_user_by('login', $wp_login);
    if (!$wp_user) {
        $wp_user = get_user_by('email', $email);
    }
    if (!$wp_user) {
        return new WP_Error('invalid_username', '등록되지 않은 계정입니다. 관리자에게 문의하세요.');
    }

    // Firebase 비밀번호 검증
    $result = firebase_verify_password($email, $password);
    if (is_wp_error($result)) {
        return $result;
    }

    return $wp_user;
}, 20, 3);

function firebase_verify_password($email, $password) {
    $url = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' . FIREBASE_API_KEY;

    $response = wp_remote_post($url, array(
        'headers' => array('Content-Type' => 'application/json'),
        'body'    => wp_json_encode(array(
            'email'             => $email,
            'password'          => $password,
            'returnSecureToken' => true,
        )),
        'timeout' => 10,
    ));

    if (is_wp_error($response)) {
        return $response;
    }

    $body = json_decode(wp_remote_retrieve_body($response), true);

    if (!empty($body['error'])) {
        $code = isset($body['error']['message']) ? $body['error']['message'] : 'UNKNOWN';
        switch ($code) {
            case 'EMAIL_NOT_FOUND':
            case 'INVALID_PASSWORD':
            case 'INVALID_LOGIN_CREDENTIALS':
                $message = '아이디 또는 비밀번호가 올바르지 않습니다.'; break;
            case 'USER_DISABLED':
                $message = '비활성화된 계정입니다. 관리자에게 문의하세요.'; break;
            default:
                $message = '로그인 중 오류가 발생했습니다. (' . $code . ')';
        }
        return new WP_Error('firebase_auth_failed', $message);
    }

    return $body;
}
