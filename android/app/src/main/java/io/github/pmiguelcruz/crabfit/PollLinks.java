package io.github.pmiguelcruz.crabfit;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PollLinks {
    static final String DEFAULT_ORIGIN = "https://crab.fit";
    private static final Pattern POLL_PATH = Pattern.compile("/[a-z0-9-]+-[0-9]{6}/?", Pattern.CASE_INSENSITIVE);
    private static final Pattern SHARED_URL = Pattern.compile("https?://[^\\s<>\"]+", Pattern.CASE_INSENSITIVE);

    static String origin(String input) {
        if (input.trim().isEmpty()) return DEFAULT_ORIGIN;

        URI url = parse(input);
        String origin = url == null ? null : webOrigin(url);
        if (origin == null || url.getRawQuery() != null || url.getRawFragment() != null) return null;
        String path = url.getRawPath();
        if (!path.isEmpty() && !path.equals("/")) return null;
        return origin;
    }

    static String poll(String input, String origin) {
        URI url = parse(input);
        if (url == null || !origin.equals(webOrigin(url))) return null;
        String path = url.getRawPath();
        if (!POLL_PATH.matcher(path).matches()) return null;
        return origin + (path.endsWith("/") ? path.substring(0, path.length() - 1) : path);
    }

    static String sharedPoll(CharSequence text, String origin) {
        if (text == null) return null;
        Matcher links = SHARED_URL.matcher(text);
        while (links.find()) {
            String candidate = links.group().replaceFirst("[).,;!?\\]]+$", "");
            String poll = poll(candidate, origin);
            if (poll != null) return poll;
        }
        return null;
    }

    static String host(String origin) {
        return URI.create(origin).getRawAuthority();
    }

    private static URI parse(String input) {
        try {
            return new URI(input.trim());
        } catch (URISyntaxException error) {
            return null;
        }
    }

    private static String webOrigin(URI url) {
        if (url.getHost() == null || url.getRawUserInfo() != null || url.getPort() > 65535) return null;
        String scheme = url.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return null;
        scheme = scheme.toLowerCase(Locale.ROOT);
        int port = url.getPort();
        if ((port == 443 && scheme.equals("https")) || (port == 80 && scheme.equals("http"))) port = -1;
        return scheme + "://" + url.getHost().toLowerCase(Locale.ROOT) + (port < 0 ? "" : ":" + port);
    }

    private PollLinks() {}
}
