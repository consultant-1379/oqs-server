#!/bin/sh
nodemon server.js
while [ ! -f server.js ]
do
  sleep 1
done
nodemon --watch modules server.js
