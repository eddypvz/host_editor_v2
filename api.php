<?php
header('Content-Type: application/json; charset=utf-8');

$dbPath = __DIR__ . '/database.db';
$db = new PDO('sqlite:' . $dbPath);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec("PRAGMA journal_mode=WAL");
$db->exec("PRAGMA foreign_keys=ON");

$db->exec("CREATE TABLE IF NOT EXISTS hosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    domain TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    favorite INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ip, domain)
)");

$db->exec("CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#0078d4'
)");

$db->exec("CREATE TABLE IF NOT EXISTS host_tags (
    host_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (host_id, tag_id),
    FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
)");

$db->exec("CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT
)");

$action = $_REQUEST['action'] ?? '';

switch ($action) {

    case 'status':
        $count = (int) $db->query("SELECT COUNT(*) FROM hosts")->fetchColumn();
        respond(['initialized' => $count > 0, 'count' => $count]);
        break;

    case 'reimport':
        $db->exec("DELETE FROM hosts");
        // Fall through to import

    case 'import':
        $path = $_POST['path'] ?? '';
        if (!file_exists($path)) {
            respond(['success' => false, 'error' => 'Archivo no encontrado: ' . $path], 404);
            break;
        }

        $content = file_get_contents($path);
        if ($content === false) {
            respond(['success' => false, 'error' => 'No se pudo leer el archivo. Verifica los permisos.'], 500);
            break;
        }

        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
        $lines = explode("\n", $content);
        $imported = 0;

        $db->beginTransaction();
        try {
            $stmt = $db->prepare("INSERT OR IGNORE INTO hosts (ip, domain, active) VALUES (?, ?, ?)");

            foreach ($lines as $line) {
                $line = preg_replace('/[\x{FEFF}\x00]/u', '', $line);
                $line = trim($line);
                if ($line === '') continue;

                $active = 1;
                if (str_starts_with($line, '#')) {
                    $active = 0;
                    $line = ltrim(substr($line, 1));
                    if ($line === '') continue;
                }

                $parts = preg_split('/\s+/', $line, 2);
                if (count($parts) < 2) continue;

                $ip = trim($parts[0]);
                $domain = trim($parts[1]);

                if (!filter_var($ip, FILTER_VALIDATE_IP)) continue;

                $domains = preg_split('/\s+/', $domain);
                foreach ($domains as $d) {
                    $d = trim($d);
                    if ($d === '' || str_starts_with($d, '#')) break;
                    $stmt->execute([$ip, $d, $active]);
                    $imported++;
                }
            }

            $db->commit();
            respond(['success' => true, 'imported' => $imported]);
        } catch (Exception $e) {
            $db->rollBack();
            respond(['success' => false, 'error' => $e->getMessage()], 500);
        }
        break;

    case 'get_hosts':
        $hosts = $db->query("
            SELECT h.*,
                   GROUP_CONCAT(t.id || '::' || t.label || '::' || t.color, '||') as tags_raw
            FROM hosts h
            LEFT JOIN host_tags ht ON ht.host_id = h.id
            LEFT JOIN tags t ON t.id = ht.tag_id
            GROUP BY h.id
            ORDER BY h.ip, h.domain
        ")->fetchAll(PDO::FETCH_ASSOC);

        $groups = [];
        foreach ($hosts as &$host) {
            $host['id'] = (int) $host['id'];
            $host['active'] = (bool) $host['active'];
            $host['favorite'] = (bool) $host['favorite'];
            $host['hidden'] = (bool) $host['hidden'];
            $host['tags'] = [];

            if ($host['tags_raw']) {
                foreach (explode('||', $host['tags_raw']) as $tagStr) {
                    $p = explode('::', $tagStr, 3);
                    if (count($p) === 3) {
                        $host['tags'][] = ['id' => (int)$p[0], 'label' => $p[1], 'color' => $p[2]];
                    }
                }
            }
            unset($host['tags_raw']);
            $groups[$host['ip']][] = $host;
        }

        respond(['groups' => $groups]);
        break;

    case 'toggle_host':
        $id = (int) ($_POST['id'] ?? 0);
        $active = (int) ($_POST['active'] ?? 0);
        $db->prepare("UPDATE hosts SET active = ? WHERE id = ?")->execute([$active, $id]);
        respond(['success' => true]);
        break;

    case 'add_host':
        $ip = trim($_POST['ip'] ?? '');
        $domain = trim($_POST['domain'] ?? '');
        if (!$ip || !$domain) {
            respond(['success' => false, 'error' => 'IP y dominio son requeridos'], 400);
            break;
        }
        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            respond(['success' => false, 'error' => 'IP no valida'], 400);
            break;
        }
        try {
            $stmt = $db->prepare("INSERT INTO hosts (ip, domain, active) VALUES (?, ?, 1)");
            $stmt->execute([$ip, $domain]);
            respond(['success' => true, 'id' => (int) $db->lastInsertId()]);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                respond(['success' => false, 'error' => 'Este host ya existe'], 409);
            } else {
                respond(['success' => false, 'error' => $e->getMessage()], 500);
            }
        }
        break;

    case 'delete_host':
        $id = (int) ($_POST['id'] ?? 0);
        $db->prepare("DELETE FROM hosts WHERE id = ?")->execute([$id]);
        respond(['success' => true]);
        break;

    case 'toggle_favorite':
        $id = (int) ($_POST['id'] ?? 0);
        $db->prepare("UPDATE hosts SET favorite = NOT favorite WHERE id = ?")->execute([$id]);
        respond(['success' => true]);
        break;

    case 'toggle_hidden':
        $id = (int) ($_POST['id'] ?? 0);
        $db->prepare("UPDATE hosts SET hidden = NOT hidden WHERE id = ?")->execute([$id]);
        respond(['success' => true]);
        break;

    // --- Tags CRUD ---

    case 'get_tags':
        $tags = $db->query("SELECT * FROM tags ORDER BY label")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($tags as &$t) { $t['id'] = (int) $t['id']; }
        respond(['tags' => $tags]);
        break;

    case 'create_tag':
        $label = trim($_POST['label'] ?? '');
        $color = trim($_POST['color'] ?? '#0078d4');
        if (!$label) {
            respond(['success' => false, 'error' => 'El nombre es requerido'], 400);
            break;
        }
        try {
            $db->prepare("INSERT INTO tags (label, color) VALUES (?, ?)")->execute([$label, $color]);
            respond(['success' => true, 'id' => (int) $db->lastInsertId()]);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                respond(['success' => false, 'error' => 'Ya existe un tag con ese nombre'], 409);
            } else {
                respond(['success' => false, 'error' => $e->getMessage()], 500);
            }
        }
        break;

    case 'update_tag':
        $id = (int) ($_POST['id'] ?? 0);
        $label = trim($_POST['label'] ?? '');
        $color = trim($_POST['color'] ?? '#0078d4');
        if (!$label) {
            respond(['success' => false, 'error' => 'El nombre es requerido'], 400);
            break;
        }
        $db->prepare("UPDATE tags SET label = ?, color = ? WHERE id = ?")->execute([$label, $color, $id]);
        respond(['success' => true]);
        break;

    case 'delete_tag':
        $id = (int) ($_POST['id'] ?? 0);
        $db->prepare("DELETE FROM tags WHERE id = ?")->execute([$id]);
        respond(['success' => true]);
        break;

    case 'assign_tag':
        $hostId = (int) ($_POST['host_id'] ?? 0);
        $tagId = (int) ($_POST['tag_id'] ?? 0);
        try {
            $db->prepare("INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES (?, ?)")->execute([$hostId, $tagId]);
        } catch (Exception $e) {}
        respond(['success' => true]);
        break;

    case 'unassign_tag':
        $hostId = (int) ($_POST['host_id'] ?? 0);
        $tagId = (int) ($_POST['tag_id'] ?? 0);
        $db->prepare("DELETE FROM host_tags WHERE host_id = ? AND tag_id = ?")->execute([$hostId, $tagId]);
        respond(['success' => true]);
        break;

    // --- Preferences ---

    case 'save_preferences':
        $prefs = $_POST['preferences'] ?? [];
        $stmt = $db->prepare("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)");
        $db->beginTransaction();
        foreach ($prefs as $key => $value) {
            $stmt->execute([$key, $value]);
        }
        $db->commit();
        respond(['success' => true]);
        break;

    case 'get_preferences':
        $rows = $db->query("SELECT key, value FROM preferences")->fetchAll(PDO::FETCH_KEY_PAIR);
        respond(['preferences' => $rows]);
        break;

    case 'read_host_file':
        $configPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
        $content = @file_get_contents($configPath);
        if ($content === false) {
            respond(['success' => false, 'error' => 'No se pudo leer el archivo hosts.'], 500);
        } else {
            respond(['success' => true, 'content' => $content, 'path' => $configPath]);
        }
        break;

    case 'write_hosts':
        $configPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
        $hosts = $db->query("SELECT ip, domain, active FROM hosts ORDER BY ip, domain")->fetchAll(PDO::FETCH_ASSOC);

        $lines = ["# Host file managed by Host Editor v2", "# Last updated: " . date('Y-m-d H:i:s'), ""];
        foreach ($hosts as $h) {
            $prefix = $h['active'] ? '' : '#';
            $lines[] = $prefix . $h['ip'] . "\t" . $h['domain'];
        }

        $result = @file_put_contents($configPath, implode("\n", $lines) . "\n");
        if ($result === false) {
            respond(['success' => false, 'error' => 'No se pudo escribir el archivo hosts. Ejecuta el servidor como administrador.'], 500);
        } else {
            respond(['success' => true]);
        }
        break;

    default:
        respond(['error' => 'Accion no valida'], 400);
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
