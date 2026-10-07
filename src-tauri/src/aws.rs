use aws_config::BehaviorVersion;
use aws_sdk_ec2::types::Filter;
use serde::{Deserialize, Serialize};
use std::error::Error as StdError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverRequest {
    pub profile: Option<String>,
    pub region: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2Instance {
    pub id: String,
    pub name: String,
    pub state: String,
    pub instance_type: String,
    pub region: String,
    pub availability_zone: String,
    pub public_ip: Option<String>,
    pub private_ip: Option<String>,
    pub public_dns: Option<String>,
}

fn error_chain(error: &(dyn StdError + 'static)) -> String {
    let mut messages = Vec::new();
    let mut current = Some(error);

    while let Some(source) = current {
        let message = source.to_string();
        if !message.is_empty() && messages.last() != Some(&message) {
            messages.push(message);
        }
        current = source.source();
    }

    messages.join(": ")
}

fn discovery_error(region: &str, error: &(dyn StdError + 'static)) -> anyhow::Error {
    let details = error_chain(error);
    let normalized = details.to_lowercase();
    let guidance = if normalized.contains("expiredtoken") || normalized.contains("expired token") {
        "The AWS credentials have expired. Refresh the profile credentials and try again."
    } else if normalized.contains("accessdenied")
        || normalized.contains("unauthorizedoperation")
        || normalized.contains("not authorized")
    {
        "The AWS identity is not allowed to list EC2 instances. Grant ec2:DescribeInstances and try again."
    } else if normalized.contains("credential")
        || (normalized.contains("profile") && normalized.contains("not"))
    {
        "CloudTerm could not load AWS credentials. Check the selected profile and make sure it has valid credentials."
    } else if normalized.contains("dispatch failure")
        || normalized.contains("connector")
        || normalized.contains("dns")
        || normalized.contains("tls")
        || normalized.contains("certificate")
        || normalized.contains("connection refused")
        || normalized.contains("timed out")
        || normalized.contains("timeout")
    {
        "CloudTerm could not reach the AWS EC2 endpoint. Check the region, internet connection, VPN or proxy, and TLS certificate settings."
    } else {
        "AWS rejected the discovery request. Check the profile, region, and EC2 permissions."
    };

    anyhow::anyhow!("Unable to query EC2 in region {region}. {guidance} Details: {details}")
}

pub async fn discover_instances(
    request: DiscoverRequest,
) -> Result<Vec<Ec2Instance>, anyhow::Error> {
    let mut loader = aws_config::defaults(BehaviorVersion::latest());

    if let Some(profile) = request
        .profile
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        loader = loader.profile_name(profile.trim());
    }

    if let Some(region) = request
        .region
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        loader = loader.region(aws_types::region::Region::new(region.trim().to_owned()));
    }

    let config = loader.load().await;
    let region = config
        .region()
        .map(|value| value.as_ref().to_owned())
        .ok_or_else(|| {
            anyhow::anyhow!(
                "AWS region is not configured. Enter a region such as ap-south-1, or add a default region to the selected AWS profile."
            )
        })?;
    let client = aws_sdk_ec2::Client::new(&config);

    let responses = client
        .describe_instances()
        .filters(
            Filter::builder()
                .name("instance-state-name")
                .values("pending")
                .values("running")
                .values("stopping")
                .values("stopped")
                .values("shutting-down")
                .values("terminated")
                .build(),
        )
        .into_paginator()
        .send()
        .collect::<Result<Vec<_>, _>>()
        .await
        .map_err(|error| discovery_error(&region, &error))?;

    let mut instances = Vec::new();

    for response in responses {
        for reservation in response.reservations() {
            for instance in reservation.instances() {
                let id = instance.instance_id().unwrap_or("unknown").to_owned();
                let name = instance
                    .tags()
                    .iter()
                    .find(|tag| tag.key() == Some("Name"))
                    .and_then(|tag| tag.value())
                    .unwrap_or(&id)
                    .to_owned();
                let state = instance
                    .state()
                    .and_then(|value| value.name().map(|name| name.as_str().to_owned()))
                    .unwrap_or_else(|| "unknown".to_owned());
                let availability_zone = instance
                    .placement()
                    .and_then(|placement| placement.availability_zone())
                    .unwrap_or("unknown")
                    .to_owned();

                instances.push(Ec2Instance {
                    id,
                    name,
                    state,
                    instance_type: instance
                        .instance_type()
                        .map(|value| value.as_str().to_owned())
                        .unwrap_or_else(|| "unknown".to_owned()),
                    region: region.clone(),
                    availability_zone,
                    public_ip: instance.public_ip_address().map(str::to_owned),
                    private_ip: instance.private_ip_address().map(str::to_owned),
                    public_dns: instance.public_dns_name().map(str::to_owned),
                });
            }
        }
    }

    instances.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(instances)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_request_uses_frontend_field_names() {
        let request: DiscoverRequest =
            serde_json::from_str(r#"{"profile":"production","region":"eu-west-1"}"#)
                .expect("camelCase request should deserialize");

        assert_eq!(request.profile.as_deref(), Some("production"));
        assert_eq!(request.region.as_deref(), Some("eu-west-1"));
    }

    #[test]
    fn instance_metadata_serializes_for_the_discovery_cards() {
        let instance = Ec2Instance {
            id: "i-123".to_owned(),
            name: "Production".to_owned(),
            state: "running".to_owned(),
            instance_type: "t3.small".to_owned(),
            region: "us-east-1".to_owned(),
            availability_zone: "us-east-1a".to_owned(),
            public_ip: Some("203.0.113.10".to_owned()),
            private_ip: Some("10.0.0.4".to_owned()),
            public_dns: None,
        };

        let json = serde_json::to_value(instance).expect("instance should serialize");
        assert_eq!(json["instanceType"], "t3.small");
        assert_eq!(json["publicIp"], "203.0.113.10");
        assert_eq!(json["availabilityZone"], "us-east-1a");
    }
}
