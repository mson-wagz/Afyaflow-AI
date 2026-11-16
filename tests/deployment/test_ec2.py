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
        health.__enter__.return_value.read.return_value = b'{"status":"ok","database":"postgresql","agentProvider":"bedrock"}'
        with patch.object(deployment, "aws", side_effect=[OUTPUTS, {"Command": {"CommandId": "synthetic"}}, {"Status": "Success"}]) as aws, \
             patch.object(deployment.time, "sleep"), \
             patch.object(deployment.urllib.request, "urlopen", return_value=health):
            deployment.main()
        send = aws.call_args_list[1].args
        parameters = json.loads(send[send.index("--parameters") + 1])
        payload = parameters["commands"][3].split()[2]
        with tarfile.open(fileobj=io.BytesIO(base64.b64decode(payload)), mode="r:gz") as archive:
            self.assertEqual(set(archive.getnames()), {"compose.yaml", "Caddyfile", "release.sh", "backup.sh"})
        self.assertEqual(send[send.index("--instance-ids") + 1], "i-synthetic")
        # Before the stack has a backup bucket, releases run with backups unconfigured.
        self.assertIn("BACKUP_BUCKET='' bash /opt/afyaflow/release.sh", parameters["commands"][4])

    def _release_with_outputs(self, outputs):
        health = unittest.mock.MagicMock()
        health.__enter__.return_value.status = 200
        health.__enter__.return_value.read.return_value = b'{"status":"ok","database":"postgresql","agentProvider":"bedrock"}'
        with patch.object(deployment, "aws", side_effect=[outputs, {"Command": {"CommandId": "synthetic"}}, {"Status": "Success"}]) as aws, \
             patch.object(deployment.time, "sleep"), \
             patch.object(deployment.urllib.request, "urlopen", return_value=health):
            deployment.main()
        return aws

    def test_backup_bucket_from_the_stack_is_passed_to_the_release(self):
        outputs = {"Stacks": [{"Outputs": OUTPUTS["Stacks"][0]["Outputs"] + [
            {"OutputKey": "BackupBucketName", "OutputValue": "afyaflow-staging-backupbucket-1abc"}]}]}
        send = self._release_with_outputs(outputs).call_args_list[1].args
        command = json.loads(send[send.index("--parameters") + 1])["commands"][4]
        self.assertIn("BACKUP_BUCKET=afyaflow-staging-backupbucket-1abc bash /opt/afyaflow/release.sh", command)

    def test_invalid_backup_bucket_never_sends_a_host_command(self):
        outputs = {"Stacks": [{"Outputs": OUTPUTS["Stacks"][0]["Outputs"] + [
            {"OutputKey": "BackupBucketName", "OutputValue": "bucket;touch /tmp/unexpected"}]}]}
        with patch.object(deployment, "aws", return_value=outputs) as aws:
            with self.assertRaises(ValueError):
                deployment.main()
        self.assertEqual(aws.call_count, 1)

    def test_arbitrary_json_is_not_a_healthy_api(self):
        health = unittest.mock.MagicMock()
        health.__enter__.return_value.status = 200
        health.__enter__.return_value.read.return_value = b'{"error":"database unavailable"}'
        with patch.object(deployment, "aws", side_effect=[OUTPUTS, {"Command": {"CommandId": "synthetic"}}, {"Status": "Success"}]), \
             patch.object(deployment.time, "sleep"), \
             patch.object(deployment.urllib.request, "urlopen", return_value=health):
            with self.assertRaises(ValueError):
                deployment.main()

    def test_release_on_another_agent_provider_fails(self):
        health = unittest.mock.MagicMock()
        health.__enter__.return_value.status = 200
        health.__enter__.return_value.read.return_value = b'{"status":"ok","database":"postgresql","agentProvider":"openai"}'
        with patch.object(deployment, "aws", side_effect=[OUTPUTS, {"Command": {"CommandId": "synthetic"}}, {"Status": "Success"}]), \
             patch.object(deployment.time, "sleep"), \
             patch.object(deployment.urllib.request, "urlopen", return_value=health):
            with self.assertRaisesRegex(ValueError, "expected 'bedrock'"):
                deployment.main()

    def test_compose_pins_the_expected_provider(self):
        compose = (Path(__file__).resolve().parents[2] / "deploy/ec2/compose.yaml").read_text()
        self.assertIn(f"AI_PROVIDER: {deployment.EXPECTED_AGENT_PROVIDER}\n", compose)
        self.assertNotIn("OPENAI", compose)


if __name__ == "__main__":
    unittest.main()
