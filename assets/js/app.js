const { createApp } = Vue;

createApp({
    data() {
        return {
            initialized: false,
            loading: true,
            importPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
            importing: false,
            importResult: null,
            groups: {},
            allTags: [],
            allTemplates: [],
            search: '',
            filters: {
                onlyActive: false,
                onlyFavorite: false,
                showHidden: false,
                tagId: null
            },
            collapsedGroups: {},
            newHost: {
                ip: '127.0.0.1',
                domain: '',
                withVhost: false,
                templateId: null,
                vhostContent: ''
            },
            showAddHostModal: false,
            highlightId: null,
            toast: { show: false, message: '', type: 'success' },
            toastTimer: null,
            showTagsModal: false,
            newTag: { label: '', color: '#0078d4' },
            editingTag: null,
            tagDropdownHostId: null,
            showSettingsModal: false,
            settings: {
                hostsPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
                vhostsPath: '',
                apacheRestartCmd: ''
            },
            reimporting: false,
            restarting: false,
            newTemplate: { name: '' },
            editingTemplate: null,
            fileEditor: {
                show: false,
                type: 'hosts',
                content: '',
                path: '',
                loading: false,
                saving: false
            }
        };
    },

    computed: {
        filteredGroups() {
            const result = {};
            const searchLower = this.search.toLowerCase();

            for (const [ip, hosts] of Object.entries(this.groups)) {
                const filtered = hosts.filter(host => {
                    if (this.filters.onlyActive && !host.active) return false;
                    if (this.filters.onlyFavorite && !host.favorite) return false;
                    if (!this.filters.showHidden && host.hidden) return false;
                    if (this.filters.tagId && !host.tags.some(t => t.id === this.filters.tagId)) return false;
                    if (searchLower) {
                        return host.domain.toLowerCase().includes(searchLower) ||
                               host.ip.toLowerCase().includes(searchLower);
                    }
                    return true;
                });
                if (filtered.length > 0) result[ip] = filtered;
            }
            return result;
        },

        totalHosts() {
            let count = 0;
            for (const hosts of Object.values(this.groups)) count += hosts.length;
            return count;
        }
    },

    methods: {
        async api(action, data = {}) {
            const formData = new FormData();
            formData.append('action', action);
            for (const [key, value] of Object.entries(data)) {
                formData.append(key, value);
            }
            const res = await fetch('api.php', { method: 'POST', body: formData });
            return res.json();
        },

        // --- Init ---

        async checkInit() {
            try {
                const res = await this.api('status');
                this.initialized = res.initialized;
                if (this.initialized) {
                    await Promise.all([this.loadHosts(), this.loadTags(), this.loadTemplates(), this.loadPreferences()]);
                }
            } catch (e) {
                console.error('Error checking status:', e);
            } finally {
                this.loading = false;
            }
        },

        async importHosts() {
            this.importing = true;
            this.importResult = null;
            try {
                const res = await this.api('import', { path: this.importPath });
                if (res.success) {
                    this.importResult = { success: true, message: `Se importaron ${res.imported} hosts correctamente.` };
                    // Save the hosts path as preference
                    await this.api('save_preferences', { 'preferences[hosts_path]': this.importPath });
                    setTimeout(async () => {
                        this.initialized = true;
                        this.settings.hostsPath = this.importPath;
                        await Promise.all([this.loadHosts(), this.loadTags(), this.loadTemplates()]);
                    }, 1200);
                } else {
                    this.importResult = { success: false, message: res.error || 'Error al importar' };
                }
            } catch (e) {
                this.importResult = { success: false, message: 'Error de conexion con el servidor' };
            } finally {
                this.importing = false;
            }
        },

        async loadPreferences() {
            try {
                const res = await this.api('get_preferences');
                const prefs = res.preferences || {};
                if (prefs.hosts_path) this.settings.hostsPath = prefs.hosts_path;
                if (prefs.vhosts_path) this.settings.vhostsPath = prefs.vhosts_path;
                if (prefs.apache_restart_cmd) this.settings.apacheRestartCmd = prefs.apache_restart_cmd;
            } catch (e) {
                console.error('Error loading preferences:', e);
            }
        },

        // --- Data loading ---

        async loadHosts() {
            try {
                const res = await this.api('get_hosts');
                this.groups = res.groups || {};
            } catch (e) {
                console.error('Error loading hosts:', e);
                this.showToast('Error al cargar los hosts', 'error');
            }
        },

        async loadTags() {
            try {
                const res = await this.api('get_tags');
                this.allTags = res.tags || [];
            } catch (e) { console.error('Error loading tags:', e); }
        },

        async loadTemplates() {
            try {
                const res = await this.api('get_templates');
                this.allTemplates = res.templates || [];
            } catch (e) { console.error('Error loading templates:', e); }
        },

        // --- Host CRUD ---

        async toggleHost(host) {
            host.active = !host.active;
            try {
                await this.api('toggle_host', { id: host.id, active: host.active ? 1 : 0 });
                this.syncHostFile();
            } catch (e) {
                host.active = !host.active;
                this.showToast('Error al actualizar el host', 'error');
            }
        },

        openAddHostModal() {
            this.newHost = { ip: '127.0.0.1', domain: '', withVhost: false, templateId: null, vhostContent: '' };
            this.showAddHostModal = true;
        },

        async addHost() {
            const ip = this.newHost.ip.trim();
            const domain = this.newHost.domain.trim();
            if (!ip || !domain) return;

            const data = { ip, domain };
            if (this.newHost.withVhost && this.newHost.vhostContent.trim()) {
                data.vhost_content = this.newHost.vhostContent;
            }

            try {
                const res = await this.api('add_host', data);
                if (res.success) {
                    this.highlightId = res.id;
                    this.showAddHostModal = false;
                    await this.loadHosts();
                    this.syncHostFile();
                    let msg = 'Host agregado correctamente';
                    if (res.vhost_error) msg += '. Nota: ' + res.vhost_error;
                    this.showToast(msg, res.vhost_error ? 'error' : 'success');
                    setTimeout(() => { this.highlightId = null; }, 2500);
                } else {
                    this.showToast(res.error || 'Error al agregar', 'error');
                }
            } catch (e) {
                this.showToast('Error de conexion', 'error');
            }
        },

        applyTemplate() {
            if (!this.newHost.templateId) {
                this.newHost.vhostContent = '';
                return;
            }
            const tpl = this.allTemplates.find(t => t.id === this.newHost.templateId);
            if (tpl) this.newHost.vhostContent = tpl.content;
        },

        copyDomain() {
            const domain = this.newHost.domain.trim();
            if (!domain) {
                this.showToast('Ingresa un dominio primero', 'error');
                return;
            }
            navigator.clipboard.writeText(domain).then(() => {
                this.showToast('Dominio copiado: ' + domain, 'success');
            });
        },

        async deleteHost(host) {
            if (!confirm(`Eliminar ${host.domain}?`)) return;
            try {
                await this.api('delete_host', { id: host.id });
                await this.loadHosts();
                this.syncHostFile();
                this.showToast('Host eliminado', 'success');
            } catch (e) {
                this.showToast('Error al eliminar', 'error');
            }
        },

        async toggleFavorite(host) {
            host.favorite = !host.favorite;
            try {
                await this.api('toggle_favorite', { id: host.id });
            } catch (e) {
                host.favorite = !host.favorite;
                this.showToast('Error al actualizar favorito', 'error');
            }
        },

        async toggleHidden(host) {
            host.hidden = !host.hidden;
            try {
                await this.api('toggle_hidden', { id: host.id });
            } catch (e) {
                host.hidden = !host.hidden;
                this.showToast('Error al ocultar host', 'error');
            }
        },

        // --- Tags ---

        async createTag() {
            const label = this.newTag.label.trim();
            if (!label) return;
            try {
                const res = await this.api('create_tag', { label, color: this.newTag.color });
                if (res.success) {
                    this.newTag.label = '';
                    this.newTag.color = '#0078d4';
                    await this.loadTags();
                } else {
                    this.showToast(res.error || 'Error al crear tag', 'error');
                }
            } catch (e) { this.showToast('Error de conexion', 'error'); }
        },

        editTag(tag) {
            this.editingTag = { id: tag.id, label: tag.label, color: tag.color };
        },

        async saveTag() {
            if (!this.editingTag || !this.editingTag.label.trim()) return;
            try {
                await this.api('update_tag', { id: this.editingTag.id, label: this.editingTag.label.trim(), color: this.editingTag.color });
                this.editingTag = null;
                await Promise.all([this.loadTags(), this.loadHosts()]);
            } catch (e) { this.showToast('Error al actualizar tag', 'error'); }
        },

        async deleteTag(tag) {
            if (!confirm(`Eliminar tag "${tag.label}"?`)) return;
            try {
                await this.api('delete_tag', { id: tag.id });
                if (this.filters.tagId === tag.id) this.filters.tagId = null;
                await Promise.all([this.loadTags(), this.loadHosts()]);
            } catch (e) { this.showToast('Error al eliminar tag', 'error'); }
        },

        hostHasTag(host, tagId) {
            return host.tags.some(t => t.id === tagId);
        },

        toggleTagDropdown(hostId) {
            this.tagDropdownHostId = this.tagDropdownHostId === hostId ? null : hostId;
        },

        async toggleHostTag(host, tagId) {
            const has = this.hostHasTag(host, tagId);
            try {
                await this.api(has ? 'unassign_tag' : 'assign_tag', { host_id: host.id, tag_id: tagId });
                await this.loadHosts();
            } catch (e) { this.showToast('Error al asignar tag', 'error'); }
        },

        // --- Templates ---

        async createTemplate() {
            const name = this.newTemplate.name.trim();
            if (!name) return;
            try {
                const res = await this.api('create_template', { name, content: '' });
                if (res.success) {
                    this.newTemplate.name = '';
                    await this.loadTemplates();
                    // Auto-edit the new template
                    const tpl = this.allTemplates.find(t => t.id === res.id);
                    if (tpl) this.editTemplate(tpl);
                } else {
                    this.showToast(res.error || 'Error al crear plantilla', 'error');
                }
            } catch (e) { this.showToast('Error de conexion', 'error'); }
        },

        editTemplate(tpl) {
            this.editingTemplate = { id: tpl.id, name: tpl.name, content: tpl.content };
        },

        async saveTemplate() {
            if (!this.editingTemplate || !this.editingTemplate.name.trim()) return;
            try {
                await this.api('update_template', {
                    id: this.editingTemplate.id,
                    name: this.editingTemplate.name.trim(),
                    content: this.editingTemplate.content
                });
                this.editingTemplate = null;
                await this.loadTemplates();
                this.showToast('Plantilla guardada', 'success');
            } catch (e) { this.showToast('Error al guardar plantilla', 'error'); }
        },

        async deleteTemplate(tpl) {
            if (!confirm(`Eliminar plantilla "${tpl.name}"?`)) return;
            try {
                await this.api('delete_template', { id: tpl.id });
                await this.loadTemplates();
            } catch (e) { this.showToast('Error al eliminar plantilla', 'error'); }
        },

        // --- Settings ---

        async openSettings() {
            this.showSettingsModal = true;
        },

        async saveSettings() {
            try {
                await this.api('save_preferences', {
                    'preferences[hosts_path]': this.settings.hostsPath,
                    'preferences[vhosts_path]': this.settings.vhostsPath,
                    'preferences[apache_restart_cmd]': this.settings.apacheRestartCmd
                });
                this.importPath = this.settings.hostsPath;
                this.showToast('Configuracion guardada', 'success');
            } catch (e) { this.showToast('Error al guardar configuracion', 'error'); }
        },

        async reimportHosts() {
            if (!confirm('Esto eliminara todos los hosts y los reimportara desde el archivo. Continuar?')) return;
            this.reimporting = true;
            try {
                const res = await this.api('reimport', { path: this.settings.hostsPath });
                if (res.success) {
                    await this.loadHosts();
                    this.showSettingsModal = false;
                    this.showToast(`Se reimportaron ${res.imported} hosts correctamente`, 'success');
                } else {
                    this.showToast(res.error || 'Error al reimportar', 'error');
                }
            } catch (e) { this.showToast('Error de conexion', 'error'); }
            finally { this.reimporting = false; }
        },

        // --- Apache restart ---

        async restartApache() {
            this.restarting = true;
            try {
                const res = await this.api('restart_apache');
                if (!res.success) {
                    this.showToast(res.error || 'Error al reiniciar Apache', 'error');
                    this.restarting = false;
                    return;
                }
                // Wait and verify Apache is back up
                this.showToast('Reiniciando Apache...', 'success');
                await new Promise(r => setTimeout(r, 2000));
                let retries = 5;
                while (retries > 0) {
                    try {
                        await fetch('api.php?action=status');
                        this.showToast('Apache reiniciado correctamente', 'success');
                        this.restarting = false;
                        return;
                    } catch (e) {
                        retries--;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                this.showToast('Apache no responde. Verifica manualmente.', 'error');
            } catch (e) {
                this.showToast('Error de conexion', 'error');
            } finally {
                this.restarting = false;
            }
        },

        // --- File Editor ---

        async openFileEditor(type) {
            this.fileEditor = { show: true, type, content: '', path: '', loading: true, saving: false };
            try {
                const res = await this.api('read_file', { type });
                if (res.success) {
                    this.fileEditor.content = res.content;
                    this.fileEditor.path = res.path;
                } else {
                    this.fileEditor.content = '';
                    this.fileEditor.path = res.error || 'Error al leer archivo';
                }
            } catch (e) {
                this.fileEditor.path = 'Error de conexion';
            } finally {
                this.fileEditor.loading = false;
            }
        },

        async saveFileEditor() {
            this.fileEditor.saving = true;
            try {
                const res = await this.api('save_file', { type: this.fileEditor.type, content: this.fileEditor.content });
                if (res.success) {
                    this.showToast('Archivo guardado correctamente', 'success');
                } else {
                    this.showToast(res.error || 'Error al guardar', 'error');
                }
            } catch (e) {
                this.showToast('Error de conexion', 'error');
            } finally {
                this.fileEditor.saving = false;
            }
        },

        // --- Sync ---

        async syncHostFile() {
            try {
                const res = await this.api('write_hosts');
                if (!res.success) {
                    this.showToast(res.error || 'Error al sincronizar archivo hosts', 'error');
                }
            } catch (e) {
                this.showToast('Error al sincronizar archivo hosts', 'error');
            }
        },

        // --- UI helpers ---

        toggleGroup(ip) {
            this.collapsedGroups[ip] = !this.collapsedGroups[ip];
        },

        highlightSearch(text) {
            if (!this.search) return text;
            const regex = new RegExp(`(${this.escapeRegex(this.search)})`, 'gi');
            return text.replace(regex, '<span class="search-highlight">$1</span>');
        },

        escapeRegex(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        showToast(message, type = 'success') {
            clearTimeout(this.toastTimer);
            this.toast = { show: true, message, type };
            this.toastTimer = setTimeout(() => { this.toast.show = false; }, 3000);
        },

        closeDropdowns(e) {
            if (this.tagDropdownHostId && !e.target.closest('.tag-dropdown-wrapper')) {
                this.tagDropdownHostId = null;
            }
        }
    },

    mounted() {
        document.addEventListener('click', this.closeDropdowns);
    },

    beforeUnmount() {
        document.removeEventListener('click', this.closeDropdowns);
    },

    created() {
        this.checkInit();
    }
}).mount('#app');
