# Systemd Service Installation

Install the Assay Protocol broker and Caddy services:

```bash
sudo cp infra/systemd/assay-broker.service /etc/systemd/system/
sudo cp infra/systemd/assay-caddy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable assay-broker assay-caddy
sudo systemctl start assay-broker assay-caddy
```

Check service status:
```bash
sudo systemctl status assay-broker
sudo systemctl status assay-caddy
```

View logs:
```bash
sudo journalctl -u assay-broker -f
sudo journalctl -u assay-caddy -f
```