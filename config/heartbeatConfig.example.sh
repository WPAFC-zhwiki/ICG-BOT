#!/usr/bin/bash
# 請參照註釋進行設定。設定好之後，請將檔案更名為 heartbeatConfig.sh

# heartbeat狀態檢測的檔案
# 可以使用的變量：
## $PROGRAM_ROOT
## $CONFIG_ROOT （等同於 $PROGRAM_ROOT/config ）
## $HOME
export STATUS_FILE="$CONFIG_ROOT/heartbeat.txt"
# 最大無更新秒數
export MAX_NO_UPDATE_TIME=60
