
// ── Firebase Auth 연동 로그인 ─────────────────────────────────────────────────
// WP 로그인 시 Firebase Auth로 비밀번호 검증. 실패 시 기본 WP 인증으로 fallback.

define('FIREBASE_API_KEY', 'AIzaSyB7YGie98rhJNHRoQritGBEyM15WtGq6A4');
define('FIREBASE_MAIL_DOMAIN', 'ourim.kr');

add_filter('authenticate', function ($user, $username, $password) {
    if (empty($username) || empty($password)) {
        return $user;
    }

    // @ 포함 여부와 무관하게 WP login은 항상 로컬파트(@ 앞)만 사용
    if (strpos($username, '@') !== false) {
        $wp_login = explode('@', $username)[0];
        $email    = $username;
    } else {
        $wp_login = $username;
        $email    = $username . '@' . FIREBASE_MAIL_DOMAIN;
    }

    $result = firebase_verify_password($email, $password);

    if (is_wp_error($result)) {
        return $user;
    }

    $wp_user = get_user_by('login', $wp_login);
    if (!$wp_user) {
        $wp_user = get_user_by('email', $email);
    }

    if ($wp_user && $wp_user->user_login !== $wp_login) {
        // 이메일로 찾았지만 login이 다른 경우(sky@ourim.kr로 생성된 경우) login 정규화
        wp_update_user(array('ID' => $wp_user->ID, 'user_login' => $wp_login));
        $wp_user = get_user_by('id', $wp_user->ID);
    }

    if (!$wp_user) {
        $display_name = isset($result['displayName']) ? $result['displayName'] : $wp_login;
        $user_id = wp_create_user($wp_login, wp_generate_password(32, true, true), $email);

        if (is_wp_error($user_id)) {
            return $user;
        }

        wp_update_user(array('ID' => $user_id, 'display_name' => $display_name));
        $wp_user = get_user_by('id', $user_id);
    }

    return $wp_user;
}, 20, 3);

function firebase_verify_password($email, $password) {
    $url = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailPassword?key=' . FIREBASE_API_KEY;

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
                $message = '등록되지 않은 계정입니다.'; break;
            case 'INVALID_PASSWORD':
                $message = '비밀번호가 올바르지 않습니다.'; break;
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
