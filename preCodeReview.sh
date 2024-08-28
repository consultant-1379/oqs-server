#!/bin/bash
export COMPOSE_PROJECT_NAME="oqsservertests"

#Get files list
$(ls -R -p --ignore=node_modules | awk '/:$/ && f{s=$0;f=0} /:$/ && !f{sub(/:$/,"");s=$0;f=1;next} NF && f{ print s"/"$0 }' > filesList.txt )

#Begin Docker procedure
time docker-compose down --volumes
if [[ $? -ne 0 ]]
then
  echo ok
fi
time docker-compose build
if [[ $? -ne 0 ]]
then
  exit 1
fi

#Test the server
time docker-compose run express tests/allTests.sh "${all_files}" --force-recreate
if [[ "$?" -ne 0 ]];
then
  echo "===================================="
  echo "ERROR : The Server tests have failed"
  echo "===================================="
  echo -e "\n"
  exit 1
else
  echo "======================================"
  echo "SUCCESS : All Server tests have passed"
  echo "======================================"
  echo -e "\n"
fi

#Copy lcov code-coverage report files from container to host
time docker cp oqsservertests_express_run_1:/usr/src/app/coverage .

#Remove containers and volumes
time docker rm oqsservertests_express_run_1
time docker-compose down --volumes
