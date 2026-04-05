# Host Editor v2

Herramienta web local para gestionar el archivo hosts de Windows de forma visual. Permite activar/desactivar, agregar, eliminar y organizar entradas del archivo hosts sin editarlo manualmente. Ideal para desarrolladores que cambian frecuentemente entre ambientes de desarrollo y local.

## Capturas

> Proximamente

## Requisitos

- PHP 7.4 o superior
- Extension `pdo_sqlite` habilitada en `php.ini`
- Servidor web local (Apache, Nginx, wServer, XAMPP, Laragon, etc.)
- El servidor debe ejecutarse **como administrador** para poder escribir en el archivo hosts del sistema

### Habilitar pdo_sqlite

En tu archivo `php.ini`, asegurate de que la siguiente linea no este comentada:

```ini
extension=pdo_sqlite
```

Reinicia el servidor web despues de hacer el cambio.

## Instalacion

1. Clona o descarga el repositorio en la carpeta de tu servidor web:

```bash
git clone https://github.com/tu-usuario/host_editor_v2.git
```

2. Accede desde el navegador:

```
http://localhost/host_editor_v2/
```

3. En la pantalla de inicializacion, ingresa la ruta de tu archivo hosts (por defecto `C:\Windows\System32\drivers\etc\hosts`) y haz click en **Importar**.

Eso es todo. La base de datos SQLite (`database.db`) se crea automaticamente.

## Uso

### Vista principal

Al importar el archivo hosts, veras todas las entradas agrupadas por direccion IP. Cada entrada muestra:

- **Switch** para activar/desactivar el host (se sincroniza automaticamente al archivo hosts del sistema)
- **Dominio** de la entrada
- **Tags** asignados al host
- **Acciones**: asignar tags, marcar favorito, ocultar, eliminar

### Filtros

La barra de herramientas incluye filtros para encontrar hosts rapidamente:

- **Busqueda** por dominio o IP con highlight en tiempo real
- **Activos** - muestra solo los hosts habilitados
- **Favoritos** - muestra solo los marcados como favoritos
- **Ocultos** - muestra los hosts ocultos
- **Por tag** - filtra los hosts que tengan un tag especifico

### Tags

Los tags permiten organizar los hosts por proyecto, cliente, ambiente, etc.

1. Haz click en **Tags** en la barra superior para abrir el administrador
2. Crea un tag con nombre y color
3. En cada fila de host, haz click en el icono de tag para asignarle tags
4. Usa los filtros de tag en la barra de herramientas para ver solo los hosts de un tag

### Agregar hosts

El boton **Nuevo host** en la barra de herramientas abre un modal donde puedes:

1. Ingresar la IP y el dominio
2. Opcionalmente activar **Crear VirtualHost en Apache**
3. Seleccionar una plantilla de VirtualHost y editarla
4. Usar el boton **Copiar dominio** para pegarlo en la plantilla

Al guardar se crea la entrada en el archivo hosts y, si se configuro, se agrega el bloque VirtualHost al archivo de Apache.

### Editores de archivos

Los botones **Hosts** y **VHosts** en la barra superior abren editores para modificar directamente los archivos del sistema. Los cambios se guardan al hacer click en **Guardar**.

### Reiniciar Apache

El boton de reinicio en la barra superior ejecuta el comando configurado para reiniciar Apache. Para configurarlo, ve a **Configuracion** e ingresa el comando segun tu sistema operativo:

| Sistema | Comando |
|---------|---------|
| Windows | `C:\Apache24\bin\httpd.exe -k restart` |
| Mac (Homebrew) | `brew services restart httpd` |
| Mac (nativo) | `sudo apachectl restart` |
| Linux | `sudo systemctl restart apache2` |

### Configuracion

El boton de engranaje permite:

- **Ruta del archivo hosts** - ubicacion del archivo hosts del sistema
- **Ruta del archivo VirtualHosts** - ubicacion del archivo de virtual hosts de Apache (ej. `httpd-vhosts.conf`)
- **Comando para reiniciar Apache** - comando a ejecutar al presionar el boton de reinicio
- **Reimportar** el archivo hosts (elimina todos los hosts de la base y los importa de nuevo, sin perder los tags)
- **Plantillas de VirtualHost** - crear, editar y eliminar plantillas reutilizables

## Estructura del proyecto

```
host_editor_v2/
  index.html          # Frontend - App Vue.js 3
  api.php             # Backend - API PHP con SQLite
  database.db         # Base de datos (auto-generada)
  assets/
    css/style.css     # Estilos
    js/app.js         # Logica Vue.js (Options API)
  CLAUDE.md           # Contexto del proyecto para desarrollo
  README.md
```

## Stack

- **Frontend:** Vue.js 3 (Options API, via CDN), Bootstrap 5, Font Awesome 6
- **Backend:** PHP (archivo unico)
- **Base de datos:** SQLite via PDO
- **Sin dependencias de Node.js** - no requiere npm, build ni bundler

## API

El backend expone un unico endpoint `api.php` con las siguientes acciones via parametro `action`:

| Accion | Metodo | Descripcion |
|--------|--------|-------------|
| `status` | POST | Verifica si hay hosts importados |
| `import` | POST | Importa hosts desde un archivo |
| `reimport` | POST | Elimina hosts y reimporta |
| `get_hosts` | POST | Obtiene todos los hosts agrupados por IP |
| `toggle_host` | POST | Activa/desactiva un host |
| `add_host` | POST | Agrega un nuevo host |
| `delete_host` | POST | Elimina un host |
| `toggle_favorite` | POST | Marca/desmarca como favorito |
| `toggle_hidden` | POST | Oculta/muestra un host |
| `get_tags` | POST | Lista todos los tags |
| `create_tag` | POST | Crea un tag |
| `update_tag` | POST | Actualiza nombre/color de un tag |
| `delete_tag` | POST | Elimina un tag |
| `assign_tag` | POST | Asigna un tag a un host |
| `unassign_tag` | POST | Remueve un tag de un host |
| `read_host_file` | POST | Lee el contenido del archivo hosts |
| `write_hosts` | POST | Escribe la base de datos al archivo hosts |

## Licencia

MIT
