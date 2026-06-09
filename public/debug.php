<?php
// debug.php - 调试通知WebSocket推送
header('Content-Type: text/plain');

$wsFile = '/workspace/www/server.js';
if (!file_exists($wsFile)) {
    echo "server.js not found\n";
    exit;
}

$content = file_get_contents($wsFile);

// 查找notification相关代码
$lines = explode("\n", $content);
$debugLines = [];
foreach ($lines as $i => $line) {
    $ln = $i + 1;
    if (stripos($line, 'notification') !== false || 
        stripos($line, 'studentConnections') !== false ||
        stripos($line, 'wsPayload') !== false) {
        $debugLines[] = "$ln: $line";
    }
}

echo "=== Found " . count($debugLines) . " lines with notification/studentConnections/wsPayload ===\n";
foreach ($debugLines as $l) {
    echo "$l\n";
}

echo "\n=== Checking around line 2050-2070 ===\n";
for ($i = 2044; $i <= 2075 && $i < count($lines); $i++) {
    echo ($i+1) . ": " . $lines[$i] . "\n";
}
