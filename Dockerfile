FROM armdocker.seli.gic.ericsson.se/dockerhub-ericsson-remote/node:14.17.0-alpine

# Create a directory where our app will be placed
RUN mkdir -p /usr/src/app

# Change directory so that our commands run inside this new directory
WORKDIR /usr/src/app

# Copy Package.JSON
COPY package.json /usr/src/app

# Install dependencies
RUN npm install \
&& npm link nodemon@1.18.9\
&& npm cache clean --force

# Install the Istanbul command line interface for code coverage
RUN npm install nyc@13.1.0 -g

# Expose the port the app runs in
EXPOSE 3000

# Serve the Development App
CMD ["./dev_start.sh"]
