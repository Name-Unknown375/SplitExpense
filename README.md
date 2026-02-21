# SplitExpense

A Splitwise-like expense splitting web app. Track shared expenses with friends and figure out who owes whom.

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Frontend   | React 18 + TypeScript, Vite       |
| Styling    | Tailwind CSS                      |
| Backend    | Node.js + Express, TypeScript     |
| Database   | PostgreSQL 15+                    |
| Auth       | Email/password, bcrypt + JWT      |
| API        | REST                              |

## Features

- User registration and login (JWT auth)
- Create groups and add members
- Add expenses with multiple split types:
  - **Equal** — split evenly among selected members
  - **Exact** — specify exact dollar amounts per person
  - **Percentage** — split by percentage
  - **Shares** — split by share ratio
- View net balances per group
- Simplified debt suggestions (who pays whom to settle up)
- Delete expenses

## Project Structure

```
SplitExpense/
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # Reusable components
│   │   ├── context/       # Auth context
│   │   ├── pages/         # Page components
│   │   ├── App.tsx        # Router setup
│   │   └── main.tsx       # Entry point
│   └── ...
├── server/                 # Express backend
│   ├── src/
│   │   ├── db/            # Database pool, schema, migrations
│   │   ├── middleware/    # Auth middleware
│   │   ├── routes/        # API routes
│   │   ├── types/         # TypeScript types
│   │   └── index.ts       # Server entry point
│   └── ...
└── package.json            # Root workspace
```

## REST API Endpoints

### Auth
| Method | Endpoint             | Description            |
|--------|----------------------|------------------------|
| POST   | `/api/auth/register` | Create a new account   |
| POST   | `/api/auth/login`    | Log in, receive JWT    |
| GET    | `/api/auth/me`       | Get current user info  |

### Groups
| Method | Endpoint                        | Description               |
|--------|---------------------------------|---------------------------|
| POST   | `/api/groups`                   | Create a group            |
| GET    | `/api/groups`                   | List user's groups        |
| GET    | `/api/groups/:id`               | Get group details         |
| POST   | `/api/groups/:id/members`       | Add a member to a group   |
| DELETE | `/api/groups/:id/members/:uid`  | Remove a member           |

### Expenses
| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| POST   | `/api/groups/:id/expenses`        | Add an expense           |
| GET    | `/api/groups/:id/expenses`        | List expenses in a group |
| GET    | `/api/groups/:id/balances`        | Get group balances       |
| DELETE | `/api/expenses/:id`               | Delete an expense        |

### Payments
| Method | Endpoint                          | Description              |
|--------|-----------------------------------|--------------------------|
| POST   | `/api/groups/:id/payments`        | Record a payment         |
| GET    | `/api/groups/:id/payments`        | List payments in a group |

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL running locally

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Set up the database

Create a PostgreSQL database:

```bash
createdb splitexpense
```

Copy the env file and configure it:

```bash
cp server/.env.example server/.env
# Edit server/.env with your database URL and a strong JWT_SECRET
```

Example `.env` values:

```env
DATABASE_URL=postgresql://splitexpense:yourpassword@localhost:5432/splitexpense
JWT_SECRET=generate-a-random-64-char-string-here
JWT_EXPIRY=7d
PORT=3001
NODE_ENV=development
```

Run the migration:

```bash
cd server && npm run db:migrate
```

### 3. Start development servers

```bash
npm run dev
```

This starts:
- Backend API at `http://localhost:3001`
- Frontend at `http://localhost:5173`

The Vite dev server proxies `/api` requests to the backend automatically.

---

## AWS Deployment Guide

### Architecture Overview

```
                    ┌──────────────┐
                    │  Route 53    │
                    │  (DNS)       │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  CloudFront  │
                    │  (CDN)       │
                    └──┬───────┬───┘
                       │       │
           ┌───────────▼─┐  ┌─▼──────────────┐
           │  S3 Bucket  │  │  ALB            │
           │  (React     │  │  (Load Balancer)│
           │   static)   │  └──────┬──────────┘
           └─────────────┘         │
                          ┌────────▼─────────┐
                          │  ECS Fargate      │
                          │  (Node.js API)    │
                          └────────┬──────────┘
                                   │
                          ┌────────▼─────────┐
                          │  RDS PostgreSQL   │
                          │  (Private subnet) │
                          └──────────────────┘
```

### Option A: ECS Fargate (Recommended — Serverless Containers)

No servers to manage. AWS handles scaling and patching.

#### Step 1: Set Up the VPC and Networking

Use the **"VPC with Public and Private Subnets"** wizard in the AWS Console:

- **Public subnets** (2, in different AZs): ALB, NAT Gateway
- **Private subnets** (2, in different AZs): ECS tasks, RDS

Or use the AWS CLI:

```bash
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=splitexpense-vpc}]'
```

Then create subnets, internet gateway, NAT gateway, and route tables as needed.

#### Step 2: Set Up RDS (PostgreSQL)

Create a DB subnet group first, then the instance:

```bash
# Create subnet group from your private subnets
aws rds create-db-subnet-group \
  --db-subnet-group-name splitexpense-db-subnets \
  --db-subnet-group-description "Private subnets for SplitExpense DB" \
  --subnet-ids <PRIVATE_SUBNET_1> <PRIVATE_SUBNET_2>

# Create the RDS instance
aws rds create-db-instance \
  --db-instance-identifier splitexpense-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15 \
  --master-username splitexpense \
  --master-user-password <STRONG_PASSWORD> \
  --allocated-storage 20 \
  --storage-encrypted \
  --no-publicly-accessible \
  --vpc-security-group-ids <RDS_SG_ID> \
  --db-subnet-group-name splitexpense-db-subnets
```

RDS security group rules:
- **Inbound**: PostgreSQL (port 5432) from the ECS security group only
- **Outbound**: none needed

#### Step 3: Store Secrets in AWS Secrets Manager

```bash
# Store the database URL
aws secretsmanager create-secret \
  --name splitexpense/database-url \
  --secret-string "postgresql://splitexpense:<PASSWORD>@<RDS_ENDPOINT>:5432/splitexpense"

# Store the JWT secret
aws secretsmanager create-secret \
  --name splitexpense/jwt-secret \
  --secret-string "$(openssl rand -base64 48)"
```

#### Step 4: Build and Push the Docker Image

```bash
# Create an ECR repository
aws ecr create-repository --repository-name splitexpense-api

# Build the Docker image
cd server
docker build -t splitexpense-api .

# Authenticate with ECR
aws ecr get-login-password --region <REGION> | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com

# Tag and push
docker tag splitexpense-api:latest \
  <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/splitexpense-api:latest
docker push \
  <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/splitexpense-api:latest
```

#### Step 5: Create the ECS Cluster, Task Definition, and Service

1. **Create an ECS cluster** (Fargate launch type):
   ```bash
   aws ecs create-cluster --cluster-name splitexpense
   ```

2. **Create a Task Definition** with these settings:
   - Container image: your ECR image URI
   - Port mapping: 3001
   - Environment variables via Secrets Manager:
     - `DATABASE_URL` → `splitexpense/database-url`
     - `JWT_SECRET` → `splitexpense/jwt-secret`
     - `NODE_ENV` → `production`
   - CPU: 256 (0.25 vCPU), Memory: 512 MB

3. **Create an ECS Service**:
   - Desired count: 1 (scale later as needed)
   - Attach to an ALB target group
   - Health check path: `/api/health` or `/api/auth/me`

#### Step 6: Set Up the ALB

```bash
# Create ALB in the public subnets
aws elbv2 create-load-balancer \
  --name splitexpense-alb \
  --subnets <PUBLIC_SUBNET_1> <PUBLIC_SUBNET_2> \
  --security-groups <ALB_SG_ID>
```

ALB configuration:
- **Listener on 443 (HTTPS)** → forward to ECS target group (port 3001)
- **Listener on 80 (HTTP)** → redirect to HTTPS
- Attach an **ACM certificate** for your domain
- ALB security group: inbound 80/443 from `0.0.0.0/0`

#### Step 7: Deploy the Frontend to S3 + CloudFront

```bash
# Build the React app
cd client
VITE_API_URL=https://api.yourdomain.com/api npm run build

# Create an S3 bucket (block ALL public access — CloudFront uses OAC)
aws s3 mb s3://splitexpense-frontend
aws s3api put-public-access-block \
  --bucket splitexpense-frontend \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Upload the build
aws s3 sync dist/ s3://splitexpense-frontend/
```

Create a CloudFront distribution:
- **Origin**: S3 bucket with Origin Access Control (OAC)
- **Default root object**: `index.html`
- **Custom error responses**: 403 and 404 → `/index.html` with 200 status (SPA routing)
- **HTTPS only** with ACM certificate
- **Cache policy**: `CachingOptimized` for static assets

#### Step 8: DNS with Route 53

Create two A-type alias records:
- `yourdomain.com` → CloudFront distribution
- `api.yourdomain.com` → ALB

---

### Option B: Single EC2 Instance (Simpler, Cheaper for Personal Use)

Best for a small group of friends where you don't need auto-scaling.

#### Step 1: Launch an EC2 Instance

- **AMI**: Amazon Linux 2023
- **Instance type**: `t3.micro` (free tier eligible)
- **Security group**:
  - Inbound: SSH (22) from your IP only, HTTP (80), HTTPS (443)
  - Outbound: all traffic
- **Key pair**: create or select an existing one
- **Storage**: 20 GB gp3

#### Step 2: Install Dependencies

```bash
ssh -i your-key.pem ec2-user@<PUBLIC_IP>

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Install PostgreSQL (self-hosted, or use RDS)
sudo yum install -y postgresql15-server
sudo postgresql-setup --initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create the database
sudo -u postgres psql -c "CREATE USER splitexpense WITH PASSWORD '<PASSWORD>';"
sudo -u postgres psql -c "CREATE DATABASE splitexpense OWNER splitexpense;"

# Install Nginx and PM2
sudo yum install -y nginx
sudo npm install -g pm2
```

#### Step 3: Deploy the App

```bash
git clone https://github.com/Name-Unknown375/SplitExpense.git
cd SplitExpense

# Create server/.env
cat > server/.env << 'EOF'
DATABASE_URL=postgresql://splitexpense:<PASSWORD>@localhost:5432/splitexpense
JWT_SECRET=<GENERATE_WITH_openssl_rand_-base64_48>
JWT_EXPIRY=7d
PORT=3001
NODE_ENV=production
EOF

# Install, build, and migrate
cd server && npm ci && npm run build && npm run db:migrate && cd ..
cd client && VITE_API_URL=/api npm ci && npm run build && cd ..

# Start the API with PM2
cd server
pm2 start dist/index.js --name splitexpense-api
pm2 save
pm2 startup  # follow the printed command to enable auto-start on reboot
```

#### Step 4: Configure Nginx as Reverse Proxy

Create `/etc/nginx/conf.d/splitexpense.conf`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Serve the React frontend
    root /home/ec2-user/SplitExpense/client/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl restart nginx
```

#### Step 5: Enable HTTPS with Let's Encrypt

```bash
sudo yum install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
# Certbot auto-renews via systemd timer
```

---

## Security Checklist

### Authentication and Secrets
- [ ] Passwords hashed with **bcrypt** (cost factor 12+)
- [ ] JWT tokens with short-lived expiry and a strong random signing key (64+ chars)
- [ ] `JWT_SECRET` and `DATABASE_URL` stored in **AWS Secrets Manager** in production
- [ ] Never commit `.env` files to git (`.gitignore` includes `.env`)
- [ ] Rotate JWT secrets periodically

### Network Security
- [ ] RDS in a **private subnet** with no public access
- [ ] Security groups use **least-privilege** (ECS → RDS on port 5432 only)
- [ ] **HTTPS everywhere** — redirect all HTTP to HTTPS
- [ ] SSH restricted to your IP only (EC2 option)
- [ ] Enable **VPC Flow Logs** for network monitoring

### Application Security
- [ ] **Rate limiting** on auth endpoints (`express-rate-limit`)
- [ ] **Input validation** on all endpoints (`zod` or `joi`)
- [ ] **Parameterized SQL queries only** — never concatenate user input into SQL
- [ ] **CORS** configured to allow only your frontend domain
- [ ] **Helmet.js** for secure HTTP headers (`X-Content-Type-Options`, `X-Frame-Options`, etc.)
- [ ] `httpOnly`, `secure`, and `sameSite` flags on any cookies

### Data Protection
- [ ] RDS **encryption at rest** enabled
- [ ] RDS **automated backups** with 7+ day retention
- [ ] S3 bucket blocks all public access (CloudFront uses OAC)
- [ ] No secrets or credentials in source code

### Monitoring
- [ ] **CloudWatch alarms** for CPU, memory, error rates, and 5xx responses
- [ ] **CloudTrail** enabled for AWS API audit logging
- [ ] Application-level logging (request logs, error logs) shipped to CloudWatch Logs
- [ ] Set up health check alerts (Route 53 health checks or ALB target health)

---

## Estimated AWS Costs (MVP / Low Traffic)

| Service                              | Monthly Cost        |
|--------------------------------------|---------------------|
| **ECS Fargate** (0.25 vCPU, 512 MB) | ~$9                 |
| **RDS** db.t3.micro (PostgreSQL)     | ~$13 (free tier: $0)|
| **S3** (static hosting)             | < $1                |
| **CloudFront**                       | < $1 (1 TB free)    |
| **ALB**                              | ~$16                |
| **Route 53**                         | $0.50/zone          |
| **Fargate total**                    | **~$40/month**      |
| **EC2 t3.micro total**              | **~$15/month** (free tier: ~$0) |

> For a personal project shared with friends, the **EC2 option** is the most cost-effective. ECS Fargate is better if you want zero server maintenance.

---

## CI/CD (Optional)

You can set up GitHub Actions to automate deployments:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: |
          cd server
          docker build -t splitexpense-api .
          aws ecr get-login-password | docker login --username AWS --password-stdin ${{ secrets.ECR_REGISTRY }}
          docker tag splitexpense-api:latest ${{ secrets.ECR_REGISTRY }}/splitexpense-api:latest
          docker push ${{ secrets.ECR_REGISTRY }}/splitexpense-api:latest
          aws ecs update-service --cluster splitexpense --service splitexpense-api --force-new-deployment

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: |
          cd client
          npm ci
          VITE_API_URL=https://api.yourdomain.com/api npm run build
          aws s3 sync dist/ s3://splitexpense-frontend/ --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DIST_ID }} --paths "/*"
```

---

## License

Private — for personal use.
