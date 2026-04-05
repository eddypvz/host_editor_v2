# Host Editor v2

## Descripcion
Remake de `host_editor_bk`. Herramienta web local para editar el archivo hosts de Windows, permitiendo cambiar entre ambientes de desarrollo/local de forma rapida.

## Tech Stack
- **Frontend:** Vue.js 3 (Options API), Bootstrap 5, FontAwesome
- **Backend:** PHP (archivo unico `api.php`)
- **Base de datos:** SQLite (via PDO en PHP)
- **Sin bundler:** Vue se carga via CDN, no requiere build step

## Arquitectura

### Frontend (Vue.js Options API)
- Archivo principal: `index.html` (monta la app Vue)
- Componentes inline o en archivos `.js` separados si crecen
- Estado reactivo manejado por Vue (reemplaza jQuery + DOM manual)
- Comunicacion con backend via `fetch()` (sin axios por simplicidad)

### Backend (`api.php`)
- Endpoint unico que recibe acciones via POST/GET
- Acciones: listar hosts, guardar hosts, gestionar preferencias, CRUD de tags
- Lee/escribe el archivo hosts de Windows
- Conecta a SQLite para preferencias, favoritos, tags y metadata

### Base de datos SQLite (`database.db`)
Tablas principales:
- `preferences` - filtros del usuario (only_active, only_favorite, show_hidden)
- `hosts_meta` - metadata por host: favorito, oculto (key: domain_ip)
- `tags` - tags con color asignados a hosts o grupos de IP

## Funcionalidades (migradas de v1)
1. Leer y parsear archivo hosts de Windows
2. Agrupar hosts por direccion IP
3. Activar/desactivar hosts (toggle comentario `#`)
4. Agregar nuevos hosts
5. Eliminar hosts
6. Marcar favoritos
7. Ocultar hosts
8. Tags con colores (por host y por grupo IP)
9. Filtros: solo activos, solo favoritos, mostrar ocultos
10. Busqueda con highlight en tiempo real
11. Notificaciones toast de exito/error

## Estructura de archivos
```
host_editor_v2/
  index.html          # App principal (monta Vue)
  api.php             # Backend unico
  database.db         # SQLite (auto-creado)
  assets/
    css/
      style.css       # Estilos custom
    js/
      app.js          # App Vue principal
  CLAUDE.md
  README.md
```

## Config
- Ruta del archivo hosts: `C:\Windows\System32\drivers\etc\hosts`
- Puerto: se ejecuta bajo el servidor web local (wServer)

## Convenciones
- UI en espanol
- Variables y funciones en ingles
- Comentarios en espanol si es necesario
- Options API de Vue (no Composition API)
