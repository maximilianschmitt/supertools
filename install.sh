set -e

cat << EOF

Welcome to the Supertools setup! In order to setup Supertools, please prepare the following:

    1. Make sure you have 'domain.tld' and '*.domain.tld' A records pointing to this server
    2. Have at a hand a DigitalOcean API key

EOF
read -n 1 -p "Press any key to start setup..."

GIT_USER_PASSWORD=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 13 ; echo '') 
ADMIN_USER_PASSWORD=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 13 ; echo '')
ENV_SESSION_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 ; echo '')
read -p "Enter your domain (e.g. example.com): " SUPERTOOLS_DOMAIN
read -p "Enter your DigitalOcean API key: " DO_API_KEY
read -p "Choose your Supertools username: " ST_OWNER_NAME
read -p "Choose your login email: " ST_OWNER_EMAIL
read -s -p "Choose your password: " ST_OWNER_PASSWORD
echo "" # Make a newline
read -p "Give your Supertools team a name: " ST_TEAM_NAME

# Create git user
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Create git user"
useradd -c "Git" -s /bin/bash -m git
echo "git:$GIT_USER_PASSWORD" | chpasswd
mkdir ~git/.ssh
chmod 700 ~git/.ssh
cp ~/.ssh/authorized_keys ~git/.ssh/authorized_keys
chmod 600 ~git/.ssh/authorized_keys
chown -R git:git ~git/.ssh

# Create admin user
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Create admin user"
useradd -c "Supertoolsadmin" -s /bin/bash -m stadmin
echo "stadmin:$ADMIN_USER_PASSWORD" | chpasswd
mkdir ~stadmin/.ssh
chmod 700 ~stadmin/.ssh
cp ~/.ssh/authorized_keys ~stadmin/.ssh/authorized_keys
chmod 600 ~stadmin/.ssh/authorized_keys
chown -R stadmin:stadmin ~stadmin/.ssh
echo "stadmin ALL=(ALL:ALL) NOPASSWD: ALL" >> /etc/sudoers

# Install Node dependencies
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Install Node dependencies"
sudo apt-get update
sudo apt-get install -y build-essential

# Install Node.js
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Install Node.js"
sudo -i -u git bash << "EOF"
set -e
curl -L https://git.io/n-install | bash -s -- -y -n 10.16.3
echo 'export N_PREFIX="$HOME/n"; [[ :$PATH: == *":$N_PREFIX/bin:"* ]] || PATH+=":$N_PREFIX/bin"' > .bashrc-tmp
cat .bashrc >> .bashrc-tmp
mv .bashrc-tmp .bashrc
. ~git/.bashrc
npm i -g yarn
echo PATH+=":$(yarn global bin)" > .bashrc-tmp
cat .bashrc >> .bashrc-tmp
mv .bashrc-tmp .bashrc
. ~git/.bashrc
EOF

# Install pm2
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Install pm2"
sudo -i -u git bash << "EOF"
set -e
yarn global add pm2
EOF

# Setup git
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Setup git"
sudo -i -u git bash << "EOF"
set -e
git config --global user.email "supertools@$(hostname)"
git config --global user.name "Supertools"
EOF

# Setup gitolite
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Setup gitolite"
sudo -i -u git bash << "EOF"
set -e
ssh-keygen -t rsa -N "" -f ~git/.ssh/id_rsa
git clone https://github.com/sitaramc/gitolite ~git/gitolite
mkdir -p bin
~git/gitolite/install -to ~git/bin
~git/bin/gitolite setup -pk ~git/.ssh/id_rsa.pub
ssh-keyscan $(curl https://ifconfig.co) >> ~git/.ssh/known_hosts
yes | git clone ~/repositories/gitolite-admin.git
EOF

# Install NGINX
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Install NGINX"
apt-get update
apt-get install -y nginx

# Setup SSL
# https://decatec.de/linux/lets-encrypt-zertifikate-mit-acme-sh-und-nginx/#Zertifikate_mit_acmesh_erzeugen
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Setup SSL"
curl https://get.acme.sh | sh
mkdir -p /etc/letsencrypt/$SUPERTOOLS_DOMAIN
DO_API_KEY=$DO_API_KEY .acme.sh/acme.sh --issue --dns dns_dgon -d "$SUPERTOOLS_DOMAIN" -d "*.$SUPERTOOLS_DOMAIN" --key-file /etc/letsencrypt/$SUPERTOOLS_DOMAIN/key.pem --ca-file /etc/letsencrypt/$SUPERTOOLS_DOMAIN/ca.pem --cert-file /etc/letsencrypt/$SUPERTOOLS_DOMAIN/cert.pem --fullchain-file /etc/letsencrypt/$SUPERTOOLS_DOMAIN/fullchain.pem --reloadcmd "sudo /bin/systemctl reload nginx.service"

# Configure NGINX with SSL
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Configure NGINX with SSL"
cat << EOF > /etc/nginx/sites-available/$SUPERTOOLS_DOMAIN
server {
    server_name $SUPERTOOLS_DOMAIN *.$SUPERTOOLS_DOMAIN;
    location / {
        proxy_pass http://localhost:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    listen 443 ssl;

    ssl_certificate /etc/letsencrypt/$SUPERTOOLS_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/$SUPERTOOLS_DOMAIN/key.pem;
    ssl_trusted_certificate /etc/letsencrypt/$SUPERTOOLS_DOMAIN/ca.pem;

    ssl_protocols TLSv1.2;

    ssl_ciphers "TLS-CHACHA20-POLY1305-SHA256:TLS-AES-256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384";

    ssl_prefer_server_ciphers on;
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_session_timeout 24h;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
}
server {
    listen 80;
    server_name $SUPERTOOLS_DOMAIN *.$SUPERTOOLS_DOMAIN;
    return 301 https://\$host\$request_uri;
}
EOF
ln -s /etc/nginx/sites-available/$SUPERTOOLS_DOMAIN /etc/nginx/sites-enabled/$SUPERTOOLS_DOMAIN
sudo systemctl restart nginx

# Setup firewall
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Setup firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Setup Supertools
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Setup Supertools"
sudo -i -u git bash << EOF
set -e
git clone https://github.com/maximilianschmitt/supertools.git
cat << EOF2 > supertools/.env
APP_DOMAIN=$SUPERTOOLS_DOMAIN
APP_PROTOCOL=https
DATA_DIR=data
GIT_SSH_HOST=$SUPERTOOLS_DOMAIN
GIT_SSH_USER=git
GITOLITE_ADMIN_PATH=/home/git/gitolite-admin
GITOLITE_REPOSITORIES_PATH=/home/git/repositories
GITOLITE_ENABLED=true
NODE_ENV=production
PORT=3333
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SUPERTOOLS_SITE_URL=https://supertools.app
SESSION_SECRET=$ENV_SESSION_SECRET
EOF2
cat << EOF2 > ecosystem.config.js
module.exports = {
    apps: [
        {
            name: "supertools",
            cwd: "./supertools",
            script: "./src/main.js"
        }
    ]
};
EOF2
cd supertools
yarn
node -r dotenv/config scripts/setup.js --username "$ST_OWNER_NAME" --email "$ST_OWNER_EMAIL" --password "$ST_OWNER_PASSWORD" --team "$ST_TEAM_NAME"
EOF

# Start Supertools
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Start Supertools"
sudo -i -u git bash << "EOF"
set -e
pm2 start ecosystem.config.js
pm2 save
EOF

# Setup auto-startup
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Setup auto-startup"
env PATH=$PATH:~git/n/bin ~git/.config/yarn/global/node_modules/pm2/bin/pm2 startup systemd -u git --hp ~git

# Disable root login
echo ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Disable root login"
sed -i 's/PermitRootLogin yes/PermitRootLogin no/g' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/g' /etc/ssh/sshd_config
/etc/init.d/ssh reload

cat << EOF

    Setup complete. Now go to https://$SUPERTOOLS_DOMAIN and log in as $ST_OWNER_EMAIL.

    ## Important login info ##
    Root login has been disabled for this server.
    To administer Supertools, please login as the git user:
        ssh git:$GIT_USER_PASSWORD@$SUPERTOOLS_DOMAIN
    For admin tasks that require root privileges, please login as the admin user:
        ssh stadmin:$ADMIN_USER_PASSWORD@$SUPERTOOLS_DOMAIN

EOF