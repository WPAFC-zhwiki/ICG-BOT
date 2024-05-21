#!/usr/bin/bash

# https://stackoverflow.com/questions/59895#answer-53183593
PROGRAM_ROOT="$( realpath "$( dirname "${BASH_SOURCE[0]}" )" )"
CONFIG_ROOT="$PROGRAM_ROOT/config"
HEART_CONFIG="$CONFIG_ROOT/heartbeatConfig.sh"

if [ ! -f "$HEART_CONFIG" ]; then
    # config file not found
    exit 1
fi

source "$HEART_CONFIG"

if [ ! -f "$STATUS_FILE" ]; then
    # status file not found
    exit 1
fi

last_update=$( stat -c %Y "$STATUS_FILE" )
current_time=$( date +%s )
no_update_time=$(( current_time - last_update ))

if [ "$no_update_time" -gt "$MAX_NO_UPDATE_TIME" ]; then
    # might be dead
    exit 1
fi

exit 0
