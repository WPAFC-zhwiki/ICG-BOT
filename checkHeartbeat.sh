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
formatted_current_time=$( date '+%Y-%m-%dT%H:%M:%SZ' --utc "--date=@$current_time" )
formatted_no_update_time=$( date '+%Y-%m-%dT%H:%M:%SZ' --utc "--date=@$no_update_time" )
log_file="$PROGRAM_ROOT/logs/heartbeat.log"

echo "[$formatted_current_time] Last update was at $formatted_no_update_time, which is $no_update_time seconds from now." | tee -a "$log_file"
tail -n 1000 "$log_file" > "$log_file-tmp" && mv "$log_file-tmp" "$log_file"

if [ "$no_update_time" -gt "$MAX_NO_UPDATE_TIME" ]; then
    # might be dead
    exit 1
fi

exit 0
