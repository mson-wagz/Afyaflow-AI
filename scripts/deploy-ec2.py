"""Send a reviewed deployment bundle through SSM; never require public SSH."""
import base64
import io
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tarfile
import time
import urllib.request


def aws(*arguments):
    result = subprocess.run(
        ["aws", *arguments, "--region", os.environ["AWS_REGION"], "--output", "json", "--no-cli-pager"],
        check=True, text=True, capture_output=True,
    )
    return json.loads(result.stdout)


def main():
    stack = os.environ.get("AWS_STACK_NAME", "afyaflow-staging")
    outputs = {
        item["OutputKey"]: item["OutputValue"]
        for item in aws("cloudformation", "describe-stacks", "--stack-name", stack)["Stacks"][0]["Outputs"]
    }
    image = os.environ["APP_IMAGE"]
    if not re.fullmatch(re.escape(outputs["RepositoryUri"]) + r":[a-f0-9]{40}-[0-9]+-[0-9]+", image):
        raise ValueError("Image must be an immutable release tag in this stack's repository")
    domain = os.environ.get("APP_DOMAIN") or f'{outputs["PublicIp"]}.sslip.io'
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}[a-zA-Z0-9]", domain):
        raise ValueError("Invalid HTTPS hostname")
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w:gz") as bundle:
        for name in ("compose.yaml", "Caddyfile", "release.sh"):
            bundle.add(Path("deploy/ec2") / name, arcname=name)
    payload = base64.b64encode(archive.getvalue()).decode("ascii")
    commands = [
        "set -eu",
        'for i in $(seq 1 120); do test -f /opt/afyaflow/bootstrap-ready && break; sleep 5; done',
        "test -f /opt/afyaflow/bootstrap-ready",
        f"printf %s {shlex.quote(payload)} | base64 -d | tar xz -C /opt/afyaflow",
        " ".join([
            f"APP_IMAGE={shlex.quote(image)}", f"APP_DOMAIN={shlex.quote(domain)}",
            f'AWS_REGION={shlex.quote(os.environ["AWS_REGION"])}',
            "bash /opt/afyaflow/release.sh",
        ]),
    ]
    parameters = json.dumps({"commands": commands, "executionTimeout": ["1800"]})
    if len(parameters.encode("utf-8")) > 24000:
        raise ValueError("Deployment bundle exceeds the SSM inline payload limit")
    response = aws(
        "ssm", "send-command", "--instance-ids", outputs["InstanceId"],
        "--document-name", "AWS-RunShellScript", "--parameters", parameters,
        "--timeout-seconds", "600", "--comment", "AfyaFlow staging deployment",
    )
    command_id = response["Command"]["CommandId"]
    print(f"Deployment command: {command_id}", flush=True)
    for _ in range(480):
        time.sleep(5)
        try:
            invocation = aws("ssm", "get-command-invocation", "--command-id", command_id,
                             "--instance-id", outputs["InstanceId"])
        except subprocess.CalledProcessError as error:
            if "InvocationDoesNotExist" in error.stderr:
                continue
            raise
        if invocation["Status"] in ("Pending", "InProgress", "Delayed"):
            continue
        print(invocation.get("StandardOutputContent", ""))
        if invocation["Status"] != "Success":
            print(invocation.get("StandardErrorContent", ""))
            raise RuntimeError(f'Deployment ended with status {invocation["Status"]}')
        break
    else:
        raise TimeoutError("Deployment did not finish; inspect SSM before retrying")
    # Caddy may need time for DNS resolution and initial certificate issuance.
    url = f"https://{domain}/api/health"
    for attempt in range(24):
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                if response.status != 200:
                    raise RuntimeError("Health endpoint did not return 200")
                # Refuse the SPA HTML fallback masquerading as a healthy API.
                health = json.loads(response.read())
                if not isinstance(health, dict) or health.get("status") != "ok" or health.get("database") != "postgresql":
                    raise ValueError("Unexpected health response")
            print(f"HTTPS health check passed: https://{domain}")
            return
        except (OSError, ValueError, RuntimeError):
            if attempt == 23:
                raise
            time.sleep(5)


if __name__ == "__main__":
    main()
