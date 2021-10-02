#!/bin/bash

export result="$( jstart -mem 2048m -once -quiet -N ICG-BOT-build npm run build )";

echo $result;
echo $result >> logs/job.log;
                                 