#!/bin/bash

if [ -n "$1" ]; then
        export config="$( echo "--icconfig $1" )"
        echo "Load custom config $1"
else
        export config=""
fi

export result="$( jstart -mem 2048m -N ICG-BOT node ../../ICG-BOT/bin/index.js $config )";

echo $result;
echo $result >> logs/job.log;
                                 