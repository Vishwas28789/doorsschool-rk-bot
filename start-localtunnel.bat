@echo off
echo Starting Doorsschool RK Bot...
start cmd /k "node server.js"
timeout /t 3
lt --port 3000 --subdomain doorsschool-rk
