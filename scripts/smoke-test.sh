#!/usr/bin/env bash
# Quick end-to-end smoke test against a running instance of the API.
# Usage: ./scripts/smoke-test.sh [base_url]
set -euo pipefail

BASE_URL="${1:-http://localhost:3000/api}"
RAND=$RANDOM
USERNAME="tester_${RAND}"
EMAIL="tester_${RAND}@example.com"
PASSWORD="Password123"

echo "==> Registering user ${USERNAME}"
REGISTER_RES=$(curl -s -X POST "${BASE_URL}/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USERNAME}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
echo "${REGISTER_RES}"

# devVerificationToken is only present outside production — see auth.service.ts
VERIFY_TOKEN=$(echo "${REGISTER_RES}" | grep -o '"devVerificationToken":"[^"]*' | cut -d'"' -f4)

if [ -z "${VERIFY_TOKEN}" ]; then
  echo "No devVerificationToken in response (are you running with NODE_ENV=production?)."
  echo "Check the server logs / your inbox for the verification link, verify manually, then re-run."
  exit 1
fi

echo -e "\n==> Confirming email with token"
curl -s -X POST "${BASE_URL}/auth/verify-email" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"${VERIFY_TOKEN}\"}"

echo -e "\n\n==> Logging in"
LOGIN_RES=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}")
echo "${LOGIN_RES}"
TOKEN=$(echo "${LOGIN_RES}" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "${TOKEN}" ]; then
  echo "Login failed, aborting."
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${TOKEN}"

echo -e "\n==> Updating profile"
curl -s -X PATCH "${BASE_URL}/users/me/profile" \
  -H "${AUTH_HEADER}" -H 'Content-Type: application/json' \
  -d '{"firstName": "Test", "lastName": "User", "phoneNumber": "+2348012345678"}'

echo -e "\n\n==> Fetching my profile"
curl -s "${BASE_URL}/users/me" -H "${AUTH_HEADER}"

echo -e "\n\n==> Funding wallet with 100000"
curl -s -X POST "${BASE_URL}/wallet/fund" \
  -H "${AUTH_HEADER}" -H 'Content-Type: application/json' \
  -d '{"amount": 100000}'

echo -e "\n\n==> Creating a TARGET plan with weekly autosave"
PLAN_RES=$(curl -s -X POST "${BASE_URL}/savings" \
  -H "${AUTH_HEADER}" -H 'Content-Type: application/json' \
  -d '{
        "name": "New Laptop",
        "type": "TARGET",
        "targetAmount": 50000,
        "autosaveEnabled": true,
        "autosaveFrequency": "WEEKLY",
        "autosaveAmount": 10000,
        "initialDeposit": 5000
      }')
echo "${PLAN_RES}"
PLAN_ID=$(echo "${PLAN_RES}" | grep -o '"savingsPlanId":"[^"]*' | cut -d'"' -f4)
[ -z "${PLAN_ID}" ] && PLAN_ID=$(echo "${PLAN_RES}" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

echo -e "\n\n==> Listing savings plans"
curl -s "${BASE_URL}/savings" -H "${AUTH_HEADER}"

echo -e "\n\n==> Depositing 5000 more into the plan"
curl -s -X POST "${BASE_URL}/savings/${PLAN_ID}/deposit" \
  -H "${AUTH_HEADER}" -H 'Content-Type: application/json' \
  -d '{"amount": 5000}'

echo -e "\n\n==> Checking wallet balance"
curl -s "${BASE_URL}/wallet/balance" -H "${AUTH_HEADER}"

echo -e "\n\nDone."
