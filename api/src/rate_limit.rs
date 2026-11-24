use std::{
    collections::HashSet,
    net::{AddrParseError, IpAddr},
    str::FromStr,
};

use axum::http::Request;
use tower_governor::{
    errors::GovernorError,
    key_extractor::{KeyExtractor, PeerIpKeyExtractor},
};

#[derive(Clone, Debug)]
pub struct ProxyAwareIp {
    trusted_proxies: HashSet<IpAddr>,
}

impl FromStr for ProxyAwareIp {
    type Err = AddrParseError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let trusted_proxies = value
            .split(',')
            .map(str::trim)
            .filter(|address| !address.is_empty())
            .map(|address| address.parse::<IpAddr>().map(|ip| ip.to_canonical()))
            .collect::<Result<_, _>>()?;
        Ok(Self { trusted_proxies })
    }
}

impl KeyExtractor for ProxyAwareIp {
    type Key = IpAddr;
    type KeyExtractionError = GovernorError;

    fn extract<T>(&self, request: &Request<T>) -> Result<IpAddr, GovernorError> {
        let peer = PeerIpKeyExtractor.extract(request)?.to_canonical();
        if !self.trusted_proxies.contains(&peer) {
            return Ok(peer);
        }

        // Only use the single address supplied by the immediate trusted proxy.
        let forwarded = request.headers().get_all("x-real-ip");
        let mut values = forwarded.iter();
        let client = match (values.next(), values.next()) {
            (Some(address), None) => address
                .to_str()
                .ok()
                .and_then(|address| address.parse::<IpAddr>().ok())
                .map(|ip| ip.to_canonical()),
            _ => None,
        };
        Ok(client.unwrap_or(peer))
    }
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use axum::extract::ConnectInfo;

    use super::*;

    fn request(peer: &str, forwarded: &[&str]) -> Request<()> {
        let peer: SocketAddr = peer.parse().unwrap();
        let mut request = Request::builder().extension(ConnectInfo(peer));
        for address in forwarded {
            request = request.header("x-real-ip", *address);
        }
        request.body(()).unwrap()
    }

    #[test]
    fn accepts_a_client_address_from_a_configured_peer() {
        let extractor: ProxyAwareIp = "192.0.2.2, ::1".parse().unwrap();
        let forwarded = request("[::ffff:192.0.2.2]:5000", &["2001:db8::4"]);

        assert_eq!(
            extractor.extract(&forwarded).unwrap(),
            "2001:db8::4".parse::<IpAddr>().unwrap()
        );
    }

    #[test]
    fn falls_back_to_the_peer_when_the_address_cannot_be_trusted() {
        let extractor: ProxyAwareIp = "192.0.2.2".parse().unwrap();
        for headers in [
            vec![],
            vec!["192.0.2.41, 192.0.2.42"],
            vec!["192.0.2.41", "192.0.2.42"],
            vec!["not an address"],
        ] {
            let invalid = request("192.0.2.2:5000", &headers);
            assert_eq!(
                extractor.extract(&invalid).unwrap(),
                "192.0.2.2".parse::<IpAddr>().unwrap()
            );
        }

        let direct = request("192.0.2.3:5000", &["192.0.2.41"]);
        assert_eq!(
            extractor.extract(&direct).unwrap(),
            "192.0.2.3".parse::<IpAddr>().unwrap()
        );
    }
}
