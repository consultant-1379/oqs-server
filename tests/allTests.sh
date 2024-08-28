#!/bin/sh

get_JS_files() {
  echo -e "\n"
  echo "Express: Getting JavaScript files..."
  all_files=$(cat < filesList.txt)
  js_files=""
  for each_script_name in ${all_files}; do
    echo $(echo ${each_script_name} | grep .)
    if [ $(echo ${each_script_name} | grep .) ];
    then
      each_script_name=$(echo ${each_script_name})
      if [ $(echo -n ${each_script_name} | tail -c3) == ".js" ];
      then
        js_files="${js_files} ${each_script_name} "
      fi
    fi
  done
}

lint_JS_files() {
  echo -e "\n"
  echo "Express: Running Lint on JS files..."
  if [ -z "${js_files}" ];
  then
    echo -e "\n"
    echo "Info: No JS files..."
  else
    ./node_modules/.bin/eslint ${js_files}
    if [ "$?" -ne 0 ];
    then
        echo -e "\n"
        echo "Error: Lint errors found in files."
        exit_code=1
    else
        echo -e "\n"
        echo "Success: No Lint errors found."
    fi
  fi
}

run_unit_tests() {
  echo -e "\n"
  echo "Express: Running Unit tests..."
  nyc npm run test
  if [ "$?" -ne 0 ];
  then
    echo -e "\n"
    echo "Error: Unit tests have failed."
    exit_code=1
  else
    echo -e "\n"
    echo "Info: Unit tests passed successfully."
  fi
}

generate_coverage_files() {
  echo -e "\n"
  echo "Express: Generating coverage files..."
  nyc report reporter=html
  if [ "$?" -ne 0 ];
  then
      echo -e "\n"
      echo "Error: Failed to generate coverage files."
  else
      echo -e "\n"
      echo "Success: Coverage files generated."
  fi
}

validate_exit_code() {
  if [ ${exit_code} -ne 0 ]; then
    exit 1
  fi
}

#RUN LINTING SCRIPTS
get_JS_files
lint_JS_files

#RUN UNIT TEST SCRIPTS
run_unit_tests
generate_coverage_files
validate_exit_code
