@echo off
echo Starting Doers School RK Bot...
start cmd /k "node server.js"
timeout /t 3
lt --port 3000 --subdomain doers-school-rk
