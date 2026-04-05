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
                domain: ''
            },
            highlightId: null,
            toast: {
                show: false,
                message: '',
                type: 'success'
            },
            toastTimer: null,
            showFileModal: false,
            fileContent: null,
            hostFilePath: '',
            showSettingsModal: false,
            reimporting: false,
            showTagsModal: false,
            newTag: { label: '', color: '#0078d4' },
            editingTag: null,
            tagDropdownHostId: null
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

                if (filtered.length > 0) {
                    result[ip] = filtered;
                }
            }
            return result;
        },

        totalHosts() {
            let count = 0;
            for (const hosts of Object.values(this.groups)) {
                count += hosts.length;
            }
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

        async checkInit() {
            try {
                const res = await this.api('status');
                this.initialized = res.initialized;
                if (this.initialized) {
                    await Promise.all([this.loadHosts(), this.loadTags()]);
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
                    this.importResult = {
                        success: true,
                        message: `Se importaron ${res.imported} hosts correctamente.`
                    };
                    setTimeout(async () => {
                        this.initialized = true;
                        await Promise.all([this.loadHosts(), this.loadTags()]);
                    }, 1200);
                } else {
                    this.importResult = {
                        success: false,
                        message: res.error || 'Error al importar'
                    };
                }
            } catch (e) {
                this.importResult = {
                    success: false,
                    message: 'Error de conexion con el servidor'
                };
            } finally {
                this.importing = false;
            }
        },

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
            } catch (e) {
                console.error('Error loading tags:', e);
            }
        },

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

        async addHost() {
            const ip = this.newHost.ip.trim();
            const domain = this.newHost.domain.trim();
            if (!ip || !domain) return;

            try {
                const res = await this.api('add_host', { ip, domain });
                if (res.success) {
                    this.newHost.domain = '';
                    this.highlightId = res.id;
                    await this.loadHosts();
                    this.syncHostFile();
                    this.showToast('Host agregado correctamente', 'success');
                    setTimeout(() => { this.highlightId = null; }, 2500);
                } else {
                    this.showToast(res.error || 'Error al agregar', 'error');
                }
            } catch (e) {
                this.showToast('Error de conexion', 'error');
            }
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
            } catch (e) {
                this.showToast('Error de conexion', 'error');
            }
        },

        editTag(tag) {
            this.editingTag = { id: tag.id, label: tag.label, color: tag.color };
        },

        async saveTag() {
            if (!this.editingTag || !this.editingTag.label.trim()) return;
            try {
                await this.api('update_tag', {
                    id: this.editingTag.id,
                    label: this.editingTag.label.trim(),
                    color: this.editingTag.color
                });
                this.editingTag = null;
                await Promise.all([this.loadTags(), this.loadHosts()]);
            } catch (e) {
                this.showToast('Error al actualizar tag', 'error');
            }
        },

        async deleteTag(tag) {
            if (!confirm(`Eliminar tag "${tag.label}"?`)) return;
            try {
                await this.api('delete_tag', { id: tag.id });
                if (this.filters.tagId === tag.id) this.filters.tagId = null;
                await Promise.all([this.loadTags(), this.loadHosts()]);
            } catch (e) {
                this.showToast('Error al eliminar tag', 'error');
            }
        },

        hostHasTag(host, tagId) {
            return host.tags.some(t => t.id === tagId);
        },

        toggleTagDropdown(hostId) {
            this.tagDropdownHostId = this.tagDropdownHostId === hostId ? null : hostId;
        },

        async toggleHostTag(host, tagId) {
            const has = this.hostHasTag(host, tagId);
            const action = has ? 'unassign_tag' : 'assign_tag';
            try {
                await this.api(action, { host_id: host.id, tag_id: tagId });
                await this.loadHosts();
            } catch (e) {
                this.showToast('Error al asignar tag', 'error');
            }
        },

        // --- File & Sync ---

        async reimportHosts() {
            if (!confirm('Esto eliminara todos los hosts y los reimportara desde el archivo. Continuar?')) return;
            this.reimporting = true;
            try {
                const res = await this.api('reimport', { path: this.importPath });
                if (res.success) {
                    await this.loadHosts();
                    this.showSettingsModal = false;
                    this.showToast(`Se reimportaron ${res.imported} hosts correctamente`, 'success');
                } else {
                    this.showToast(res.error || 'Error al reimportar', 'error');
                }
            } catch (e) {
                this.showToast('Error de conexion', 'error');
            } finally {
                this.reimporting = false;
            }
        },

        async viewHostFile() {
            this.showFileModal = true;
            this.fileContent = null;
            try {
                const res = await this.api('read_host_file');
                if (res.success) {
                    this.fileContent = res.content;
                    this.hostFilePath = res.path;
                } else {
                    this.fileContent = 'Error: ' + (res.error || 'No se pudo leer el archivo');
                }
            } catch (e) {
                this.fileContent = 'Error de conexion con el servidor';
            }
        },

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
            this.toastTimer = setTimeout(() => {
                this.toast.show = false;
            }, 3000);
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
