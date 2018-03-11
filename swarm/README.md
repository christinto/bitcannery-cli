# Environment

Local machine requirements
`Terraform >= v0.11.3`
`provider.digitalocean v0.1.3`

# Provision digital ocean droplets

1. Create token https://cloud.digitalocean.com/settings/api/tokens with read and write permissions.
2. `export TF_VAR_digitalocean_token=YOUR_TOKEN_HERE`
3. `terraform plan`
4. `terraform apply`
5. `terraform destroy`

# Prepare local computer to deploy

Checkout latest version of crypto-legacy compress and put to data dir
```
mkdir ~/tmp && cd ~/tmp
git clone git@github.com:skozin/crypto-legacy.git
git checkout release
zip -r crypto-legacy.zip crypto-legacy
cd PATH_TO_REPO/swarm/
mv ~/tmp/crypto-legacy.zip data/dms-common/
rm -rf ~/tmp
```

# Setup each instance

Let's ssh there:

```
ssh root@<your_ip_here>
```

# Import accounts
```
geth --datadir="~/.rinkeby" --rinkeby --rpc --rpcapi='db,eth,net,web3,personal' --rpcport '9545' --rpcaddr '127.0.0.1' --rpccorsdomain '*' console

> loadScript('/root/import.js')
> exit
```

Check accounts:

```
ls /root/.rinkeby/keystore | grep -Po '[0-9a-f]*$'
```

## Run geth as a daemon

Check that everything is ok
```
chmod +x /root/run-gethd.sh
./run-gethd.sh
```

Run as a daemon
```
cp /root/service/geth.service /etc/systemd/system/
systemctl enable geth
systemctl start geth
```

Check logs
```
journalctl -u geth
```

Check console
```
geth attach ~/.rinkeby/geth.ipc console

> eth.syncing
> eth.accounts
> loadScript('/root/geth-scripts/balances.js')
```
Wait until it reach synced state.

## Prepare keepers

Unzip
```
unzip crypto-legacy.zip
```

Install node deps
```
cd /root/crypto-legacy/dms
npm i
cd /root
```

Setup keepers
```
chmod +x setup_keepers.sh
./setup_keepers.sh
```

Check config for keeper 4
```
CONFIG_NAME="keeper-4" /usr/bin/node /root/crypto-legacy/dms/index.js print-config
```

## Run keepers as a daemons

Run as a daemon
```
cp /root/service/keeper@.service /etc/systemd/system/
cp /root/service/keepers.target /etc/systemd/system/
systemctl enable keepers.target
systemctl start keepers.target
```
