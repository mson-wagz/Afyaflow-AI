import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deploy_ec2", Path(__file__).resolve().parents[2] / "scripts/deploy-ec2.py")
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)
REPOSITORY = "111111111111.dkr.ecr.eu-west-1.amazonaws.com/afyaflow-staging"
ENV = {"AWS_REGION": "eu-west-1", "APP_DOMAIN": "demo.example.com", "APP_IMAGE": f"{REPOSITORY}:{'a' * 40}-123-1"}
OUTPUTS = {"Stacks": [{"Outputs": [
    {"OutputKey": "RepositoryUri", "OutputValue": REPOSITORY},
    {"OutputKey": "InstanceId", "OutputValue": "i-synthetic"},
    {"OutputKey": "PublicIp", "OutputValue": "192.0.2.1"},
]}]}


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, ENV, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_foreign_image_never_sends_a_host_command(self):
        os.environ["APP_IMAGE"] = "attacker.example/app:latest"
        with patch.object(deployment, "aws", return_value=OUTPUTS) as aws:
            with self.assertRaises(ValueError):
                deployment.main()
        self.assertEqual(aws.call_count, 1)

    def test_hostname_injection_never_sends_a_host_command(self):
        os.environ["APP_DOMAIN"] = "demo.example.com;touch /tmp/unexpected"
        with patch.object(deployment, "aws", return_value=OUTPUTS) as aws:
            with self.assertRaises(ValueError):
                deployment.main()
        self.assertEqual(aws.call_count, 1)

    def test_failed_remote_release_never_reports_https_success(self):
        with patch.object(deployment, "aws", side_effect=[OUTPUTS, {"Command": {"CommandId": "synthetic"}}, {"Status": "Failed"}]), \
             patch.object(deployment.time, "sleep"), \
             patch.object(deployment.urllib.request, "urlopen") as http:
            with self.assertRaises(RuntimeError):
                deployment.main()
            http.assert_not_called()

    def test_healthy_release_sends_only_expected_files_and_checks_database(self):
        health = unittest.mock.MagicMock()
        health.__enter__.return_value.status = 200
        health.__enter__.return_value.read.return_value = b'{"status":"ok","database":"postgresql"}'
        with patch.object(deployment, "aws", side_effect=[OUTPUTS, {"Command": {"CommandId": "synthetic"}}, {"Status": "Success"}]) as aws, \
             patch.object(deployment.time, "sleep"), \
             patch.object(deployment.urllib.request, "urlopen", return_value=health):
            deployment.main()
        send = aws.call_args_list[1].args
        parameters = json.loads(send[send.index("--parameters") + 1])
        payload = parameters["commands"][3].split()[2]
        with tarfile.open(fileobj=io.BytesIO(base64.b64decode(payload)), mode="r:gz") as archive:
            self.assertEqual(set(archive.getnames()), {"compose.yaml", "Caddyfile", "release.sh"})
        self.assertEqual(send[send.index("--instance-ids") + 1], "i-synthetic")

    def test_arbitrary_json_is_not_a_healthy_api(self):
        health = unittest.mock.MagicMock()
        health.__enter__.return_value.status = 200
        health.__enter__.return_value.read.return_value = b'{"error":"database unavailable"}'
        with patch.object(deployment, "aws", side_effect=[OUTPUTS, {"Command": {"CommandId": "synthetic"}}, {"Status": "Success"}]), \
             patch.object(deployment.time, "sleep"), \
             patch.object(deployment.urllib.request, "urlopen", return_value=health):
            with self.assertRaises(ValueError):
                deployment.main()


if __name__ == "__main__":
    unittest.main()
