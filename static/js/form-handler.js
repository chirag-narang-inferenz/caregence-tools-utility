document.addEventListener('DOMContentLoaded', () => {
    const quillInstances = {};
    const schema = window.TOOL_SCHEMA || {};
    let activeConnections = [];
    const root = document.getElementById('schema-form-root');
    const modal = document.getElementById('result-modal');
    const closeBtn = document.querySelector('.close-modal');
    const resultPayload = document.getElementById('result-payload');
    const toolForm = document.getElementById('tool-form');

    initializeConnectionsMeta(schema);

    // ─── Create a labelled form-group ──────────────────────────────────────────
    function makeGroup(name, label, required, fullWidth = false) {
        const group = document.createElement('div');
        group.className = 'form-group' + (fullWidth ? ' full-width' : '');
        if (name) group.dataset.fieldName = name;

        const lbl = document.createElement('label');
        lbl.setAttribute('for', name || label);
        lbl.innerHTML = `${label}${required ? ' <span class="required">*</span>' : ''}`;
        group.appendChild(lbl);
        return group;
    }

    // ─── Render a help text span ────────────────────────────────────────────────
    function addHelp(group, text) {
        if (!text) return;
        const span = document.createElement('span');
        span.className = 'field-help';
        span.textContent = text;
        group.appendChild(span);
    }

    function createSearchableSelect(parentGroup, labelHTML, defaultText, searchPlaceholder = 'Search...') {
        parentGroup.innerHTML = '';
        if (labelHTML) {
            parentGroup.innerHTML = labelHTML;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `<span>${defaultText}</span> <i data-lucide="chevron-down" style="width: 14px; height: 14px; color: var(--text-muted);"></i>`;

        const dropdown = document.createElement('div');
        dropdown.className = 'custom-select-dropdown';
        dropdown.style.display = 'none';
        dropdown.style.flexDirection = 'column';

        const searchInp = document.createElement('input');
        searchInp.type = 'text';
        searchInp.className = 'custom-select-search';
        searchInp.placeholder = searchPlaceholder;

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-select-options';

        dropdown.appendChild(searchInp);
        dropdown.appendChild(optionsContainer);
        wrapper.appendChild(trigger);
        wrapper.appendChild(dropdown);
        parentGroup.appendChild(wrapper);

        if (window.lucide) lucide.createIcons();

        let selectedValue = '';
        let optionsList = []; // Array of { value, text }
        let onChangeCallback = null;

        // Toggle dropdown
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.style.display === 'flex';
            // Close all other dropdowns first
            document.querySelectorAll('.custom-select-dropdown').forEach(d => {
                if (d !== dropdown) d.style.display = 'none';
            });
            if (!isOpen) {
                dropdown.style.display = 'flex';
                searchInp.value = '';
                filterOptions('');
                setTimeout(() => searchInp.focus(), 10);
            } else {
                dropdown.style.display = 'none';
            }
        });

        // Prevent closing when clicking inside the dropdown
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Close when clicking outside
        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
        });

        function filterOptions(term) {
            optionsContainer.innerHTML = '';
            const filtered = optionsList.filter(o => o.text.toLowerCase().includes(term.toLowerCase()));
            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'custom-select-option empty';
                empty.textContent = 'No matching items';
                optionsContainer.appendChild(empty);
                return;
            }

            filtered.forEach(o => {
                const optEl = document.createElement('div');
                optEl.className = 'custom-select-option';
                if (o.value === selectedValue) {
                    optEl.classList.add('selected');
                }
                optEl.textContent = o.text;
                optEl.addEventListener('click', () => {
                    selectedValue = o.value;
                    trigger.querySelector('span').textContent = o.text;
                    dropdown.style.display = 'none';
                    if (onChangeCallback) {
                        onChangeCallback(selectedValue);
                    }
                });
                optionsContainer.appendChild(optEl);
            });
        }

        searchInp.addEventListener('input', (e) => {
            filterOptions(e.target.value);
        });

        return {
            get value() {
                return selectedValue;
            },
            set value(val) {
                selectedValue = val;
                const found = optionsList.find(o => o.value === val);
                trigger.querySelector('span').textContent = found ? found.text : defaultText;
            },
            setOptions: (list) => {
                optionsList = list;
                filterOptions('');
            },
            clear: () => {
                selectedValue = '';
                trigger.querySelector('span').textContent = defaultText;
                optionsList = [];
                filterOptions('');
            },
            addEventListener: (event, callback) => {
                if (event === 'change') {
                    onChangeCallback = callback;
                }
            },
            setPlaceholder: (text) => {
                trigger.querySelector('span').textContent = text;
            }
        };
    }

    function makeConnectionDropdown(connMeta, name = 'connection_name') {
        const connTypes = Array.isArray(connMeta.type) ? connMeta.type : [connMeta.type || 'Service'];
        const displayConnType = connTypes.join(' or ');

        const group = makeGroup(name, `Select ${displayConnType} Connection`, true);
        const sel = document.createElement('select');
        sel.id = name;
        sel.name = name;
        sel.required = true;
        sel.innerHTML = `<option value="">Choose a ${displayConnType} connection...</option>`;

        const availableConns = window.CAREGENCE_CONNECTIONS || [];
        availableConns.forEach(c => {
            const cType = (c.connection_type || '').toLowerCase();
            const allowedTypes = connTypes.map(t => (t || '').toLowerCase());
            const isMatch = allowedTypes.includes(cType) || allowedTypes.includes('service');

            if (isMatch) {
                const opt = document.createElement('option');
                opt.value = c.connection_name;
                opt.textContent = `${c.connection_name} [${c.connection_type}]`;
                sel.appendChild(opt);
            }
        });

        group.appendChild(sel);
        return group;
    }

    // ─── Build field for a single property ─────────────────────────────────────
    function buildField(name, fieldSchema, requiredList, defs, namePrefix = '', fieldMeta = {}) {
        const required = requiredList && requiredList.includes(name);
        const fullId = namePrefix ? `${namePrefix}.${name}` : name;

        let effectiveSchema = fieldSchema;
        if (fieldSchema.anyOf) {
            const nonNull = fieldSchema.anyOf.find(s => s.type !== 'null');
            if (nonNull) effectiveSchema = { ...nonNull, description: fieldSchema.description, title: fieldSchema.title, default: fieldSchema.default };
        }
        console.log("effectiveSchema:", effectiveSchema)
        console.log("fieldSchema:", fieldSchema)
        console.log("name:", name)
        console.log()



        const label = effectiveSchema.display_title || fieldSchema.display_title || effectiveSchema.title || fieldSchema.title || name
        console.log("label:", label)
        const desc = effectiveSchema.description || fieldSchema.description || '';
        const defaultVal = effectiveSchema.default !== undefined ? effectiveSchema.default : fieldSchema.default;

        const metaType = fieldMeta.type;

        if (metaType === 'dynamic-array') {
            let itemSchema = {};
            if (fieldSchema.items) {
                let itemsRef = fieldSchema.items.$ref;
                if (itemsRef) {
                    itemSchema = resolveDef(itemsRef, defs) || {};
                } else {
                    itemSchema = fieldSchema.items;
                }
            }
            const itemProperties = itemSchema.properties || {};
            const hasPhone = 'phone' in itemProperties || 'Phone' in itemProperties;
            const hasEmail = 'email' in itemProperties || 'Email' in itemProperties;

            const group = makeGroup(fullId, label, required, true);
            const container = document.createElement('div');
            container.className = 'dynamic-array-container';

            const listWrapper = document.createElement('div');
            listWrapper.className = 'dynamic-array-list';
            container.appendChild(listWrapper);

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'btn-secondary add-array-item-btn';
            addBtn.style.cssText = 'margin-top: 0.5rem;';
            addBtn.innerHTML = `<i data-lucide="plus" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i> <span>${fieldMeta.add_button_label || '+ Add Item'}</span>`;
            container.appendChild(addBtn);

            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = fullId;
            hidden.value = '[]';
            container.appendChild(hidden);

            group.appendChild(container);
            addHelp(group, desc);

            function updateHiddenValue() {
                const items = [];
                listWrapper.querySelectorAll('.dynamic-array-card').forEach(card => {
                    const phone = card.querySelector('.phone-input')?.value.trim() || '';
                    const email = card.querySelector('.email-input')?.value.trim() || '';

                    const data = {};
                    card.querySelectorAll('.kv-row').forEach(row => {
                        const k = row.querySelector('.kv-key-input')?.value.trim() || '';
                        const v = row.querySelector('.kv-value-input')?.value.trim() || '';
                        if (k) {
                            data[k] = v;
                        }
                    });

                    const item = { data };
                    if (hasPhone && phone) item.phone = phone;
                    if (hasEmail && email) item.email = email;
                    items.push(item);
                });
                hidden.value = JSON.stringify(items);
                hidden.dispatchEvent(new Event('change', { bubbles: true }));
            }

            function createCard(initialData = { phone: '', email: '', data: {} }) {
                const card = document.createElement('div');
                card.className = 'dynamic-array-card glass';
                card.style.cssText = 'border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; position: relative; background: var(--card-bg);';

                const deleteCardBtn = document.createElement('button');
                deleteCardBtn.type = 'button';
                deleteCardBtn.className = 'btn-icon delete-card-btn';
                deleteCardBtn.innerHTML = '<i data-lucide="trash-2" style="width:16px;height:16px;color:#ef4444;"></i>';
                deleteCardBtn.style.cssText = 'position: absolute; top: 1rem; right: 1rem; background:none; border:none; cursor:pointer; padding: 4px;';
                deleteCardBtn.addEventListener('click', () => {
                    card.remove();
                    updateHiddenValue();
                });
                card.appendChild(deleteCardBtn);

                const cardGrid = document.createElement('div');
                cardGrid.className = 'fields-grid';
                const columns = (hasPhone && hasEmail) ? '1fr 1fr' : '1fr';
                cardGrid.style.cssText = `display: grid; grid-template-columns: ${columns}; gap: 1rem; margin-top: 1rem;`;

                let gridHasFields = false;
                if (hasPhone) {
                    const phoneGroup = document.createElement('div');
                    phoneGroup.className = 'form-group';
                    phoneGroup.innerHTML = '<label>Phone Number</label>';
                    const phoneInput = document.createElement('input');
                    phoneInput.type = 'text';
                    phoneInput.className = 'phone-input';
                    phoneInput.placeholder = 'e.g., +15551234567';
                    phoneInput.value = initialData.phone || '';
                    phoneInput.addEventListener('input', updateHiddenValue);
                    phoneGroup.appendChild(phoneInput);
                    cardGrid.appendChild(phoneGroup);
                    gridHasFields = true;
                }

                if (hasEmail) {
                    const emailGroup = document.createElement('div');
                    emailGroup.className = 'form-group';
                    emailGroup.innerHTML = '<label>Email Address</label>';
                    const emailInput = document.createElement('input');
                    emailInput.type = 'email';
                    emailInput.className = 'email-input';
                    emailInput.placeholder = 'e.g., user@example.com';
                    emailInput.value = initialData.email || '';
                    emailInput.addEventListener('input', updateHiddenValue);
                    emailGroup.appendChild(emailInput);
                    cardGrid.appendChild(emailGroup);
                    gridHasFields = true;
                }

                if (gridHasFields) {
                    card.appendChild(cardGrid);
                }

                // Data Group (Key-Value)
                const dataGroup = document.createElement('div');
                dataGroup.className = 'form-group full-width';
                dataGroup.style.marginTop = '1rem';
                dataGroup.innerHTML = '<label>Personalization Data</label>';

                const kvContainer = document.createElement('div');
                kvContainer.className = 'kv-rows-container';
                dataGroup.appendChild(kvContainer);

                const addFieldBtn = document.createElement('button');
                addFieldBtn.type = 'button';
                addFieldBtn.className = 'btn-secondary add-field-btn';
                addFieldBtn.style.cssText = 'padding: 0.25rem 0.75rem; font-size: 0.8rem; margin-top: 0.5rem;';
                addFieldBtn.innerHTML = '<i data-lucide="plus" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i> Add Field';

                function createKvRow(kVal = '', vVal = '') {
                    const row = document.createElement('div');
                    row.className = 'kv-row';
                    row.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;';

                    const kInp = document.createElement('input');
                    kInp.type = 'text';
                    kInp.className = 'kv-key-input';
                    kInp.placeholder = 'Key';
                    kInp.style.flex = '1';
                    kInp.value = kVal;
                    kInp.addEventListener('input', updateHiddenValue);

                    const vInp = document.createElement('input');
                    vInp.type = 'text';
                    vInp.className = 'kv-value-input';
                    vInp.placeholder = 'Value';
                    vInp.style.flex = '1';
                    vInp.value = vVal;
                    vInp.addEventListener('input', updateHiddenValue);

                    const delRowBtn = document.createElement('button');
                    delRowBtn.type = 'button';
                    delRowBtn.className = 'btn-icon delete-row-btn';
                    delRowBtn.innerHTML = '<i data-lucide="x" style="width:14px;height:14px;color:#ef4444;"></i>';
                    delRowBtn.style.cssText = 'background:none; border:none; cursor:pointer; padding: 4px;';
                    delRowBtn.addEventListener('click', () => {
                        row.remove();
                        updateHiddenValue();
                    });

                    row.appendChild(kInp);
                    row.appendChild(vInp);
                    row.appendChild(delRowBtn);
                    kvContainer.appendChild(row);
                    if (window.lucide) lucide.createIcons();
                }

                // Populate initial data fields
                if (initialData.data && Object.keys(initialData.data).length > 0) {
                    Object.entries(initialData.data).forEach(([k, v]) => {
                        createKvRow(k, v);
                    });
                }

                addFieldBtn.addEventListener('click', () => {
                    createKvRow();
                });

                dataGroup.appendChild(addFieldBtn);
                card.appendChild(dataGroup);

                listWrapper.appendChild(card);
                if (window.lucide) lucide.createIcons();
                updateHiddenValue();
            }

            addBtn.addEventListener('click', () => {
                createCard();
            });

            // Initial item
            createCard();

            return group;
        }

        // Custom widget overrides: key-value (Standalone dictionary editor)
        if (metaType === 'key-value') {
            const group = makeGroup(fullId, label, required, true);
            const container = document.createElement('div');
            container.className = 'key-value-container';

            const rowsContainer = document.createElement('div');
            rowsContainer.className = 'kv-rows-container';
            container.appendChild(rowsContainer);

            const addFieldBtn = document.createElement('button');
            addFieldBtn.type = 'button';
            addFieldBtn.className = 'btn-secondary add-field-btn';
            addFieldBtn.style.cssText = 'margin-top: 0.5rem;';
            addFieldBtn.innerHTML = `<i data-lucide="plus" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i> <span>${fieldMeta.add_button_label || '+ Add Field'}</span>`;
            container.appendChild(addFieldBtn);

            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = fullId;
            hidden.value = '{}';
            container.appendChild(hidden);

            group.appendChild(container);
            addHelp(group, desc);

            function updateHiddenValue() {
                const data = {};
                rowsContainer.querySelectorAll('.kv-row').forEach(row => {
                    const k = row.querySelector('.kv-key-input')?.value.trim() || '';
                    const v = row.querySelector('.kv-value-input')?.value.trim() || '';
                    if (k) {
                        data[k] = v;
                    }
                });
                hidden.value = JSON.stringify(data);
                hidden.dispatchEvent(new Event('change', { bubbles: true }));
            }

            function createKvRow(kVal = '', vVal = '') {
                const row = document.createElement('div');
                row.className = 'kv-row';
                row.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;';

                const kInp = document.createElement('input');
                kInp.type = 'text';
                kInp.className = 'kv-key-input';
                kInp.placeholder = 'Key';
                kInp.style.flex = '1';
                kInp.value = kVal;
                kInp.addEventListener('input', updateHiddenValue);

                const vInp = document.createElement('input');
                vInp.type = 'text';
                vInp.className = 'kv-value-input';
                vInp.placeholder = 'Value';
                vInp.style.flex = '1';
                vInp.value = vVal;
                vInp.addEventListener('input', updateHiddenValue);

                const delRowBtn = document.createElement('button');
                delRowBtn.type = 'button';
                delRowBtn.className = 'btn-icon delete-row-btn';
                delRowBtn.innerHTML = '<i data-lucide="x" style="width:14px;height:14px;color:#ef4444;"></i>';
                delRowBtn.style.cssText = 'background:none; border:none; cursor:pointer; padding: 4px;';
                delRowBtn.addEventListener('click', () => {
                    row.remove();
                    updateHiddenValue();
                });

                row.appendChild(kInp);
                row.appendChild(vInp);
                row.appendChild(delRowBtn);
                rowsContainer.appendChild(row);
                if (window.lucide) lucide.createIcons();
                updateHiddenValue();
            }

            addFieldBtn.addEventListener('click', () => {
                createKvRow();
            });

            // Start with one empty row
            createKvRow();

            return group;
        }

        // Custom widget overrides: HTML (Quill editor)
        if (metaType === 'html') {
            const group = makeGroup(fullId, label, required, true);
            const editorWrapper = document.createElement('div');
            editorWrapper.className = 'quill-editor-wrapper';

            const editorDiv = document.createElement('div');
            editorDiv.className = 'quill-editor-surface';
            if (defaultVal) editorDiv.innerHTML = defaultVal;
            editorWrapper.appendChild(editorDiv);

            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.id = fullId;
            hidden.name = fullId;
            hidden.value = defaultVal || '';
            editorWrapper.appendChild(hidden);

            group.appendChild(editorWrapper);
            addHelp(group, desc);

            requestAnimationFrame(() => {
                if (typeof Quill === 'undefined') return;
                const quill = new Quill(editorDiv, {
                    theme: 'snow',
                    placeholder: desc || 'Enter rich text…',
                    modules: {
                        toolbar: [
                            [{ header: [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ color: [] }, { background: [] }],
                            [{ list: 'ordered' }, { list: 'bullet' }],
                            [{ indent: '-1' }, { indent: '+1' }],
                            ['blockquote', 'code-block'],
                            ['link', 'image'],
                            ['clean']
                        ]
                    }
                });
                quill.on('text-change', () => {
                    hidden.value = quill.root.innerHTML;
                });
                quillInstances[fullId] = { quill, hidden };
            });
            return group;
        }

        // Custom widget overrides: Storage File Browser (browse-file)
        if (metaType === 'browse-file') {
            const group = makeGroup(fullId, label, required, true);
            const isMultiple = !!fieldMeta.multiple;
            let selectedPaths = [];
            const allowedExtensions = getAllowedExtensions(fieldMeta, fieldSchema);
            console.log("[Storage Browser] Field:", name, "allowedExtensions:", allowedExtensions);
            const matchesExtensions = (fileName, explorer) => {
                if (explorer && explorer.filterCheckbox && !explorer.filterCheckbox.checked) return true;
                if (allowedExtensions.length === 0) return true;
                const lower = fileName.toLowerCase();
                return allowedExtensions.some(ext => lower.endsWith(ext));
            };

            // Container
            const container = document.createElement('div');
            container.className = 'storage-picker-container';

            // Value input group (input + browse btn)
            const inputGroup = document.createElement('div');
            inputGroup.className = 'storage-picker-input-group';

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.id = fullId;
            inp.name = fullId;
            inp.placeholder = desc || 'Select a file path...';
            if (required) inp.required = true;
            if (defaultVal) {
                inp.value = defaultVal;
                selectedPaths = defaultVal.split(',').map(s => s.trim()).filter(Boolean);
            }

            const browseBtn = document.createElement('button');
            browseBtn.type = 'button';
            browseBtn.className = 'btn-primary';
            browseBtn.innerHTML = '<i data-lucide="folder-search"></i> <span>Browse...</span>';

            inputGroup.appendChild(inp);
            inputGroup.appendChild(browseBtn);
            container.appendChild(inputGroup);

            // The Drawer/Panel
            const drawer = document.createElement('div');
            drawer.className = 'storage-picker-drawer';

            // Tabs Row
            const tabsRow = document.createElement('div');
            tabsRow.className = 'storage-tabs';

            const tabOpts = [
                { id: 'aws', label: 'AWS S3', icon: 'hard-drive' },
                { id: 'azure', label: 'Azure Blob', icon: 'cloud' },
                { id: 'local', label: 'Local Device', icon: 'laptop' },
                { id: 'custom', label: 'Custom Input', icon: 'edit-3' }
            ];

            const tabButtons = {};
            const panels = {};

            tabOpts.forEach(opt => {
                const tabBtn = document.createElement('button');
                tabBtn.type = 'button';
                tabBtn.className = 'storage-tab-btn';
                tabBtn.innerHTML = `<i data-lucide="${opt.icon}"></i> ${opt.label}`;
                tabsRow.appendChild(tabBtn);
                tabButtons[opt.id] = tabBtn;

                const panel = document.createElement('div');
                panel.className = 'storage-panel';
                drawer.appendChild(panel);
                panels[opt.id] = panel;
            });

            drawer.insertBefore(tabsRow, drawer.firstChild);
            container.appendChild(drawer);
            group.appendChild(container);
            addHelp(group, desc);

            // Active tab state
            let activeTab = 'aws';
            function switchTab(tabId) {
                activeTab = tabId;
                Object.keys(tabButtons).forEach(k => {
                    tabButtons[k].classList.toggle('active', k === tabId);
                    panels[k].classList.toggle('active', k === tabId);
                });
            }

            Object.keys(tabButtons).forEach(k => {
                tabButtons[k].addEventListener('click', () => switchTab(k));
            });

            // Initialize with AWS active
            switchTab('aws');

            // Global toggle
            browseBtn.addEventListener('click', () => {
                drawer.classList.toggle('active');
                if (window.lucide) lucide.createIcons();
            });

            // Populate S3 Panel
            const s3Panel = panels['aws'];
            const s3SelectRow = document.createElement('div');
            s3SelectRow.className = 'storage-select-row';

            const s3ConnGroup = document.createElement('div');
            s3ConnGroup.className = 'form-group';
            s3ConnGroup.innerHTML = '<label>AWS Connection</label>';
            const s3ConnSelect = document.createElement('select');
            s3ConnSelect.innerHTML = '<option value="">Choose AWS connection...</option>';
            s3ConnGroup.appendChild(s3ConnSelect);
            s3SelectRow.appendChild(s3ConnGroup);

            const s3BucketGroup = document.createElement('div');
            s3BucketGroup.className = 'form-group';
            const s3BucketSelect = createSearchableSelect(s3BucketGroup, '<label>S3 Bucket</label>', 'Select bucket...', 'Search buckets...');
            s3SelectRow.appendChild(s3BucketGroup);
            s3Panel.appendChild(s3SelectRow);

            const availableConns = window.CAREGENCE_CONNECTIONS || [];
            availableConns.forEach(c => {
                const cType = (c.connection_type || '').toLowerCase();
                if (cType.includes('aws') || cType.includes('s3')) {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.dataset.name = c.connection_name;
                    opt.textContent = `${c.connection_name} [${c.connection_type}]`;
                    s3ConnSelect.appendChild(opt);
                }
            });

            // Populate Azure Panel
            const azPanel = panels['azure'];
            const azSelectRow = document.createElement('div');
            azSelectRow.className = 'storage-select-row';

            const azConnGroup = document.createElement('div');
            azConnGroup.className = 'form-group';
            azConnGroup.innerHTML = '<label>Azure Connection</label>';
            const azConnSelect = document.createElement('select');
            azConnSelect.innerHTML = '<option value="">Choose Azure connection...</option>';
            azConnGroup.appendChild(azConnSelect);
            azSelectRow.appendChild(azConnGroup);

            const azContainerGroup = document.createElement('div');
            azContainerGroup.className = 'form-group';
            const azContainerSelect = createSearchableSelect(azContainerGroup, '<label>Blob Container</label>', 'Select container...', 'Search containers...');
            azSelectRow.appendChild(azContainerGroup);
            azPanel.appendChild(azSelectRow);

            availableConns.forEach(c => {
                const cType = (c.connection_type || '').toLowerCase();
                if (cType.includes('azure_blob') || cType.includes('azure_storage') || cType.includes('azureblob')) {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.dataset.name = c.connection_name;
                    opt.textContent = `${c.connection_name} [${c.connection_type}]`;
                    azConnSelect.appendChild(opt);
                }
            });

            // Explorer Factory Helper
            function createExplorer(panel) {
                const explorerBody = document.createElement('div');
                explorerBody.className = 'storage-browser-body';

                const searchRow = document.createElement('div');
                searchRow.className = 'storage-browser-search-row';
                const searchInp = document.createElement('input');
                searchInp.type = 'text';
                searchInp.placeholder = 'Search files...';
                searchRow.appendChild(searchInp);

                const filterCheckbox = document.createElement('input');
                filterCheckbox.type = 'checkbox';
                filterCheckbox.checked = true;
                filterCheckbox.style.cssText = 'cursor: pointer; width: 14px; height: 14px; accent-color: var(--accent); margin: 0;';

                const filterToggle = document.createElement('label');
                filterToggle.className = 'storage-filter-toggle';
                filterToggle.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-muted); cursor: pointer; user-select: none; margin-right: 4px; white-space: nowrap;';
                filterToggle.appendChild(filterCheckbox);

                const toggleSpan = document.createElement('span');
                toggleSpan.textContent = 'Filter by type';
                filterToggle.appendChild(toggleSpan);

                searchRow.appendChild(filterToggle);
                explorerBody.appendChild(searchRow);

                const breadcrumbs = document.createElement('div');
                breadcrumbs.className = 'storage-breadcrumbs';
                breadcrumbs.innerHTML = '<span>Root</span>';
                explorerBody.appendChild(breadcrumbs);

                const tableWrapper = document.createElement('div');
                tableWrapper.className = 'storage-explorer-table-wrapper';
                const table = document.createElement('table');
                table.className = 'storage-explorer-table';
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                tableWrapper.appendChild(table);
                explorerBody.appendChild(tableWrapper);
                panel.appendChild(explorerBody);

                return { searchInp, filterCheckbox, breadcrumbs, tbody: table.querySelector('tbody'), tableWrapper };
            }

            const s3Explorer = createExplorer(s3Panel);
            const azExplorer = createExplorer(azPanel);

            // Local Device Setup
            const localPanel = panels['local'];
            const localCard = document.createElement('div');
            localCard.className = 'storage-local-picker-card';
            localCard.innerHTML = `
                <i data-lucide="folder-open"></i>
                <h3>Select Local Directory</h3>
                <p>Browse directories and files directly on your local device</p>
                <span class="storage-local-picker-info">Compatible with all directory selection features</span>
            `;
            localPanel.appendChild(localCard);
            const localExplorer = createExplorer(localPanel);
            localExplorer.searchInp.closest('.storage-browser-body').style.display = 'none';

            // Custom panel setup
            const customPanel = panels['custom'];
            const customGroup = document.createElement('div');
            customGroup.className = 'form-group full-width';
            customGroup.innerHTML = '<label>Manual Link or Placeholder</label>';
            const customInp = document.createElement('input');
            customInp.type = 'text';
            customInp.placeholder = 'e.g. {{previous_tool}} or https://myhost.com/data.csv';
            customInp.value = inp.value;
            customInp.addEventListener('input', () => {
                inp.value = customInp.value;
            });
            customGroup.appendChild(customInp);
            customPanel.appendChild(customGroup);

            inp.addEventListener('input', () => {
                if (activeTab === 'custom') {
                    customInp.value = inp.value;
                }
            });

            // Done button at bottom of drawer
            const drawerFooter = document.createElement('div');
            drawerFooter.style.cssText = 'display: flex; justify-content: flex-end; margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 0.75rem;';
            const doneBtn = document.createElement('button');
            doneBtn.type = 'button';
            doneBtn.className = 'btn-primary';
            doneBtn.innerHTML = '<i data-lucide="check"></i> <span>Done</span>';
            doneBtn.addEventListener('click', () => {
                drawer.classList.remove('active');
            });
            drawerFooter.appendChild(doneBtn);
            drawer.appendChild(drawerFooter);

            // ─── AWS S3 logic ───
            let s3Files = [];
            let allS3Buckets = [];

            async function fetchS3Buckets(connectionId) {
                s3BucketSelect.clear();
                s3BucketSelect.setPlaceholder('Loading buckets...');
                s3Explorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">Select a bucket to browse files</td></tr>';
                try {
                    const res = await fetch('/api/connection-actions/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            connection_id: connectionId,
                            action: 'bucket_list',
                            params: {}
                        })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();

                    if (data.success && data.data && data.data.result) {
                        allS3Buckets = data.data.result;
                        s3BucketSelect.clear();
                        const options = allS3Buckets.map(b => ({
                            value: b.value || b,
                            text: b.displayName || b
                        }));
                        s3BucketSelect.setOptions(options);
                    } else {
                        s3BucketSelect.clear();
                        s3BucketSelect.setPlaceholder('Failed to load buckets');
                    }
                } catch (e) {
                    s3BucketSelect.clear();
                    s3BucketSelect.setPlaceholder('Error loading buckets');
                }
                if (window.lucide) lucide.createIcons();
            }

            async function fetchS3Files(connectionId, bucketName) {
                s3Explorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state"><span class="loading-spinner" style="border-top-color:var(--accent);"></span> Loading files...</td></tr>';
                try {
                    const res = await fetch('/api/connection-actions/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            connection_id: connectionId,
                            action: 'file_list',
                            params: { bucket_name: bucketName }
                        })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();

                    if (data.success && data.data && data.data.result) {
                        s3Files = data.data.result.map(f => typeof f === 'object' ? (f.value || f.name) : f);
                        renderS3Explorer('');
                    } else {
                        s3Explorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">No files found or error occurred</td></tr>';
                    }
                } catch (e) {
                    s3Explorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">Error loading files</td></tr>';
                }
                if (window.lucide) lucide.createIcons();
            }

            function renderS3Explorer(filter = '') {
                s3Explorer.tbody.innerHTML = '';
                const filtered = s3Files.filter(f => f.toLowerCase().includes(filter.toLowerCase()) && matchesExtensions(f, s3Explorer));

                if (filtered.length === 0) {
                    s3Explorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state"><i data-lucide="folder-open"></i> No files match the filter</td></tr>';
                    if (window.lucide) lucide.createIcons();
                    return;
                }

                filtered.forEach(file => {
                    const filePath = `s3://${s3BucketSelect.value}/${file}`;
                    const tr = document.createElement('tr');
                    tr.className = 'storage-item-row';

                    if (selectedPaths.includes(filePath)) {
                        tr.classList.add('selected');
                    }

                    tr.innerHTML = `
                        <td class="storage-item-name-cell">
                            <i data-lucide="file" class="storage-item-icon file"></i>
                            <span>${file}</span>
                        </td>
                        <td>File</td>
                    `;
                    tr.addEventListener('click', () => {
                        if (isMultiple) {
                            const idx = selectedPaths.indexOf(filePath);
                            if (idx > -1) {
                                selectedPaths.splice(idx, 1);
                                tr.classList.remove('selected');
                            } else {
                                selectedPaths.push(filePath);
                                tr.classList.add('selected');
                            }
                            inp.value = selectedPaths.join(', ');
                        } else {
                            selectedPaths = [filePath];
                            s3Explorer.tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
                            tr.classList.add('selected');
                            inp.value = filePath;
                        }
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                    s3Explorer.tbody.appendChild(tr);
                });
                if (window.lucide) lucide.createIcons();
            }

            s3ConnSelect.addEventListener('change', () => {
                const connId = s3ConnSelect.value;
                if (connId) fetchS3Buckets(connId);
                else {
                    s3BucketSelect.clear();
                    s3Explorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">Select connection and bucket to browse</td></tr>';
                }
            });

            s3BucketSelect.addEventListener('change', (bucketName) => {
                const connId = s3ConnSelect.value;
                if (connId && bucketName) {
                    s3Explorer.breadcrumbs.innerHTML = `<span class="storage-breadcrumb-item">s3://</span> <span class="storage-breadcrumb-item">${bucketName}</span>`;
                    fetchS3Files(connId, bucketName);
                }
            });

            s3Explorer.searchInp.addEventListener('input', (e) => {
                renderS3Explorer(e.target.value);
            });
            s3Explorer.filterCheckbox.addEventListener('change', () => {
                renderS3Explorer(s3Explorer.searchInp.value);
            });

            // ─── Azure Blob logic ───
            let azFiles = [];
            let allAzContainers = [];

            async function fetchAzureContainers(connectionId) {
                azContainerSelect.clear();
                azContainerSelect.setPlaceholder('Loading containers...');
                azExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">Select a container to browse</td></tr>';
                try {
                    const res = await fetch('/api/connection-actions/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            connection_id: connectionId,
                            action: 'container_list',
                            params: {}
                        })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();

                    if (data.success && data.data && data.data.result) {
                        allAzContainers = data.data.result;
                        azContainerSelect.clear();
                        const options = allAzContainers.map(c => ({
                            value: c.value || c,
                            text: c.displayName || c
                        }));
                        azContainerSelect.setOptions(options);
                    } else {
                        azContainerSelect.clear();
                        azContainerSelect.setPlaceholder('Failed to load containers');
                    }
                } catch (e) {
                    azContainerSelect.clear();
                    azContainerSelect.setPlaceholder('Error loading containers');
                }
                if (window.lucide) lucide.createIcons();
            }

            async function fetchAzureBlobs(connectionId, containerName) {
                azExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state"><span class="loading-spinner" style="border-top-color:var(--accent);"></span> Loading blobs...</td></tr>';
                try {
                    const res = await fetch('/api/connection-actions/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            connection_id: connectionId,
                            action: 'file_list',
                            params: { container_name: containerName }
                        })
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();

                    if (data.success && data.data && data.data.result) {
                        azFiles = data.data.result.map(f => typeof f === 'object' ? (f.value || f.name) : f);
                        renderAzureExplorer('');
                    } else {
                        azExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">No blobs found or error occurred</td></tr>';
                    }
                } catch (e) {
                    azExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">Error loading blobs</td></tr>';
                }
                if (window.lucide) lucide.createIcons();
            }

            function renderAzureExplorer(filter = '') {
                azExplorer.tbody.innerHTML = '';
                const filtered = azFiles.filter(f => f.toLowerCase().includes(filter.toLowerCase()) && matchesExtensions(f, azExplorer));

                if (filtered.length === 0) {
                    azExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state"><i data-lucide="folder-open"></i> No blobs match the filter</td></tr>';
                    if (window.lucide) lucide.createIcons();
                    return;
                }

                filtered.forEach(blob => {
                    const filePath = `azure://${azContainerSelect.value}/${blob}`;
                    const tr = document.createElement('tr');
                    tr.className = 'storage-item-row';

                    if (selectedPaths.includes(filePath)) {
                        tr.classList.add('selected');
                    }

                    tr.innerHTML = `
                        <td class="storage-item-name-cell">
                            <i data-lucide="file" class="storage-item-icon file"></i>
                            <span>${blob}</span>
                        </td>
                        <td>Blob</td>
                    `;
                    tr.addEventListener('click', () => {
                        if (isMultiple) {
                            const idx = selectedPaths.indexOf(filePath);
                            if (idx > -1) {
                                selectedPaths.splice(idx, 1);
                                tr.classList.remove('selected');
                            } else {
                                selectedPaths.push(filePath);
                                tr.classList.add('selected');
                            }
                            inp.value = selectedPaths.join(', ');
                        } else {
                            selectedPaths = [filePath];
                            azExplorer.tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
                            tr.classList.add('selected');
                            inp.value = filePath;
                        }
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                    azExplorer.tbody.appendChild(tr);
                });
                if (window.lucide) lucide.createIcons();
            }

            azConnSelect.addEventListener('change', () => {
                const connId = azConnSelect.value;
                if (connId) fetchAzureContainers(connId);
                else {
                    azContainerSelect.clear();
                    azExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">Select connection and container to browse</td></tr>';
                }
            });

            azContainerSelect.addEventListener('change', (containerName) => {
                const connId = azConnSelect.value;
                if (connId && containerName) {
                    azExplorer.breadcrumbs.innerHTML = `<span class="storage-breadcrumb-item">azure://</span> <span class="storage-breadcrumb-item">${containerName}</span>`;
                    fetchAzureBlobs(connId, containerName);
                }
            });

            azExplorer.searchInp.addEventListener('input', (e) => {
                renderAzureExplorer(e.target.value);
            });
            azExplorer.filterCheckbox.addEventListener('change', () => {
                renderAzureExplorer(azExplorer.searchInp.value);
            });

            // ─── Local Device logic ───
            let localDirectoryHandle = null;
            let currentPathParts = [];
            let currentDirectoryHandle = null;

            let isVirtualLocal = false;
            let virtualRoot = { name: 'Root', kind: 'directory', children: {} };

            localCard.addEventListener('click', async () => {
                let success = false;
                if (typeof window.showDirectoryPicker !== 'undefined') {
                    try {
                        localDirectoryHandle = await window.showDirectoryPicker();
                        currentDirectoryHandle = localDirectoryHandle;
                        currentPathParts = [];
                        localCard.style.display = 'none';
                        localExplorer.searchInp.closest('.storage-browser-body').style.display = 'flex';
                        isVirtualLocal = false;
                        await listLocalFiles();
                        success = true;
                    } catch (e) {
                        console.warn('showDirectoryPicker failed or cancelled, trying webkitdirectory fallback...', e);
                    }
                }

                if (!success) {
                    // Fallback to webkitdirectory input (works on insecure contexts & all browsers)
                    const fileInp = document.createElement('input');
                    fileInp.type = 'file';
                    fileInp.webkitdirectory = true;
                    fileInp.directory = true;
                    fileInp.multiple = true;
                    fileInp.style.display = 'none';
                    document.body.appendChild(fileInp);

                    fileInp.addEventListener('change', () => {
                        const files = Array.from(fileInp.files);
                        if (files.length === 0) {
                            fileInp.remove();
                            return;
                        }

                        localCard.style.display = 'none';
                        localExplorer.searchInp.closest('.storage-browser-body').style.display = 'flex';

                        setupVirtualLocalFileSystem(files);
                        fileInp.remove();
                    });

                    fileInp.click();
                }
            });

            // Virtual Local Filesystem Helpers (for Firefox, Safari, Insecure contexts/Webviews)
            function setupVirtualLocalFileSystem(files) {
                isVirtualLocal = true;
                let rootDirName = 'Local Folder';
                if (files[0] && files[0].webkitRelativePath) {
                    rootDirName = files[0].webkitRelativePath.split('/')[0];
                }

                virtualRoot = { name: rootDirName, kind: 'directory', children: {} };

                files.forEach(file => {
                    const parts = file.webkitRelativePath.split('/');
                    let curr = virtualRoot;
                    for (let i = 1; i < parts.length; i++) {
                        const part = parts[i];
                        const isLast = (i === parts.length - 1);
                        if (isLast) {
                            curr.children[part] = {
                                name: part,
                                kind: 'file',
                                fileObject: file,
                                path: file.webkitRelativePath
                            };
                        } else {
                            if (!curr.children[part]) {
                                curr.children[part] = {
                                    name: part,
                                    kind: 'directory',
                                    children: {}
                                };
                            }
                            curr = curr.children[part];
                        }
                    }
                });

                localDirectoryHandle = virtualRoot;
                currentDirectoryHandle = virtualRoot;
                currentPathParts = [];
                listLocalFilesVirtual();
            }

            function listLocalFilesVirtual() {
                localExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state"><span class="loading-spinner" style="border-top-color:var(--accent);"></span> Scanning folder...</td></tr>';
                try {
                    const entries = Object.values(currentDirectoryHandle.children);
                    entries.sort((a, b) => {
                        if (a.kind !== b.kind) {
                            return a.kind === 'directory' ? -1 : 1;
                        }
                        return a.name.localeCompare(b.name);
                    });

                    renderLocalExplorerVirtual(entries);
                    updateLocalBreadcrumbsVirtual();
                } catch (e) {
                    localExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">Failed to read directory.</td></tr>';
                }
                if (window.lucide) lucide.createIcons();
            }

            function updateLocalBreadcrumbsVirtual() {
                let html = `<span class="storage-breadcrumb-item" id="local-breadcrumb-virtual-root">local://${virtualRoot.name}</span>`;
                currentPathParts.forEach((part, index) => {
                    html += ` / <span class="storage-breadcrumb-item local-breadcrumb-virtual-part" data-index="${index}">${part}</span>`;
                });
                localExplorer.breadcrumbs.innerHTML = html;

                document.getElementById('local-breadcrumb-virtual-root').addEventListener('click', () => {
                    currentDirectoryHandle = virtualRoot;
                    currentPathParts = [];
                    listLocalFilesVirtual();
                });

                localExplorer.breadcrumbs.querySelectorAll('.local-breadcrumb-virtual-part').forEach(el => {
                    el.addEventListener('click', () => {
                        const targetIdx = parseInt(el.dataset.index);
                        currentPathParts = currentPathParts.slice(0, targetIdx + 1);

                        let curr = virtualRoot;
                        for (const part of currentPathParts) {
                            curr = curr.children[part];
                        }
                        currentDirectoryHandle = curr;
                        listLocalFilesVirtual();
                    });
                });
            }

            function renderLocalExplorerVirtual(entries, filter = '') {
                localExplorer.tbody.innerHTML = '';
                const filtered = entries.filter(e => {
                    const matchesFilter = e.name.toLowerCase().includes(filter.toLowerCase());
                    if (!matchesFilter) return false;
                    if (e.kind === 'directory') return true;
                    return matchesExtensions(e.name, localExplorer);
                });

                if (filtered.length === 0) {
                    localExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state"><i data-lucide="folder-open"></i> Folder is empty</td></tr>';
                    if (window.lucide) lucide.createIcons();
                    return;
                }

                filtered.forEach(entry => {
                    const tr = document.createElement('tr');
                    tr.className = 'storage-item-row';
                    const iconName = entry.kind === 'directory' ? 'folder' : 'file';

                    const relativePath = [...currentPathParts, entry.name].join('/');
                    const fileFullPath = `local://${virtualRoot.name}/${relativePath}`;

                    if (selectedPaths.includes(fileFullPath)) {
                        tr.classList.add('selected');
                    }

                    tr.innerHTML = `
                        <td class="storage-item-name-cell">
                            <i data-lucide="${iconName}" class="storage-item-icon ${iconName}"></i>
                            <span>${entry.name}</span>
                        </td>
                        <td>${entry.kind === 'directory' ? 'Folder' : 'File'}</td>
                    `;

                    tr.addEventListener('click', () => {
                        if (entry.kind === 'directory') {
                            currentPathParts.push(entry.name);
                            currentDirectoryHandle = entry;
                            listLocalFilesVirtual();
                        } else {
                            if (isMultiple) {
                                const idx = selectedPaths.indexOf(fileFullPath);
                                if (idx > -1) {
                                    selectedPaths.splice(idx, 1);
                                    tr.classList.remove('selected');
                                } else {
                                    selectedPaths.push(fileFullPath);
                                    tr.classList.add('selected');
                                }
                                inp.value = selectedPaths.join(', ');
                            } else {
                                selectedPaths = [fileFullPath];
                                localExplorer.tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
                                tr.classList.add('selected');
                                inp.value = fileFullPath;
                            }
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    });

                    localExplorer.tbody.appendChild(tr);
                });
                if (window.lucide) lucide.createIcons();
            }

            // Standard Directory Picker Helpers
            async function listLocalFiles() {
                localExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state"><span class="loading-spinner" style="border-top-color:var(--accent);"></span> Scanning folder...</td></tr>';
                try {
                    const entries = [];
                    for await (const entry of currentDirectoryHandle.values()) {
                        entries.push(entry);
                    }

                    entries.sort((a, b) => {
                        if (a.kind !== b.kind) {
                            return a.kind === 'directory' ? -1 : 1;
                        }
                        return a.name.localeCompare(b.name);
                    });

                    renderLocalExplorer(entries);
                    updateLocalBreadcrumbs();
                } catch (e) {
                    localExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state">Failed to read directory. Please grant permission if prompted.</td></tr>';
                }
                if (window.lucide) lucide.createIcons();
            }

            function updateLocalBreadcrumbs() {
                let html = `<span class="storage-breadcrumb-item" id="local-breadcrumb-root">local://${localDirectoryHandle.name}</span>`;
                currentPathParts.forEach((part, index) => {
                    html += ` / <span class="storage-breadcrumb-item local-breadcrumb-part" data-index="${index}">${part}</span>`;
                });
                localExplorer.breadcrumbs.innerHTML = html;

                document.getElementById('local-breadcrumb-root').addEventListener('click', async () => {
                    currentDirectoryHandle = localDirectoryHandle;
                    currentPathParts = [];
                    await listLocalFiles();
                });

                localExplorer.breadcrumbs.querySelectorAll('.local-breadcrumb-part').forEach(el => {
                    el.addEventListener('click', async () => {
                        const targetIdx = parseInt(el.dataset.index);
                        currentPathParts = currentPathParts.slice(0, targetIdx + 1);

                        let curr = localDirectoryHandle;
                        for (const part of currentPathParts) {
                            curr = await curr.getDirectoryHandle(part);
                        }
                        currentDirectoryHandle = curr;
                        await listLocalFiles();
                    });
                });
            }

            function renderLocalExplorer(entries, filter = '') {
                localExplorer.tbody.innerHTML = '';
                const filtered = entries.filter(e => {
                    const matchesFilter = e.name.toLowerCase().includes(filter.toLowerCase());
                    if (!matchesFilter) return false;
                    if (e.kind === 'directory') return true;
                    return matchesExtensions(e.name, localExplorer);
                });

                if (filtered.length === 0) {
                    localExplorer.tbody.innerHTML = '<tr><td colspan="2" class="storage-empty-state"><i data-lucide="folder-open"></i> Folder is empty</td></tr>';
                    if (window.lucide) lucide.createIcons();
                    return;
                }

                filtered.forEach(entry => {
                    const tr = document.createElement('tr');
                    tr.className = 'storage-item-row';
                    const iconName = entry.kind === 'directory' ? 'folder' : 'file';

                    const relativePath = [...currentPathParts, entry.name].join('/');
                    const fileFullPath = `local://${localDirectoryHandle.name}/${relativePath}`;

                    if (selectedPaths.includes(fileFullPath)) {
                        tr.classList.add('selected');
                    }

                    tr.innerHTML = `
                        <td class="storage-item-name-cell">
                            <i data-lucide="${iconName}" class="storage-item-icon ${iconName}"></i>
                            <span>${entry.name}</span>
                        </td>
                        <td>${entry.kind === 'directory' ? 'Folder' : 'File'}</td>
                    `;

                    tr.addEventListener('click', async () => {
                        if (entry.kind === 'directory') {
                            currentPathParts.push(entry.name);
                            currentDirectoryHandle = await currentDirectoryHandle.getDirectoryHandle(entry.name);
                            await listLocalFiles();
                        } else {
                            if (isMultiple) {
                                const idx = selectedPaths.indexOf(fileFullPath);
                                if (idx > -1) {
                                    selectedPaths.splice(idx, 1);
                                    tr.classList.remove('selected');
                                } else {
                                    selectedPaths.push(fileFullPath);
                                    tr.classList.add('selected');
                                }
                                inp.value = selectedPaths.join(', ');
                            } else {
                                selectedPaths = [fileFullPath];
                                localExplorer.tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
                                tr.classList.add('selected');
                                inp.value = fileFullPath;
                            }
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    });

                    localExplorer.tbody.appendChild(tr);
                });
                if (window.lucide) lucide.createIcons();
            }

            localExplorer.searchInp.addEventListener('input', async (e) => {
                if (isVirtualLocal) {
                    const entries = Object.values(currentDirectoryHandle.children);
                    entries.sort((a, b) => {
                        if (a.kind !== b.kind) {
                            return a.kind === 'directory' ? -1 : 1;
                        }
                        return a.name.localeCompare(b.name);
                    });
                    renderLocalExplorerVirtual(entries, e.target.value);
                } else {
                    const entries = [];
                    for await (const entry of currentDirectoryHandle.values()) {
                        entries.push(entry);
                    }
                    entries.sort((a, b) => {
                        if (a.kind !== b.kind) {
                            return a.kind === 'directory' ? -1 : 1;
                        }
                        return a.name.localeCompare(b.name);
                    });
                    renderLocalExplorer(entries, e.target.value);
                }
            });

            localExplorer.filterCheckbox.addEventListener('change', async () => {
                if (isVirtualLocal) {
                    listLocalFilesVirtual();
                } else {
                    await listLocalFiles();
                }
            });

            return group;
        }

        // Custom widget overrides: File upload
        if (metaType === 'file') {
            const group = makeGroup(fullId, label, required, true);
            const wrapper = document.createElement('div');
            wrapper.className = 'file-upload-wrapper';

            const inp = document.createElement('input');
            inp.type = 'file';
            inp.id = fullId;
            inp.name = fullId;
            if (fieldMeta.multiple) inp.multiple = true;
            if (fieldMeta.accept) inp.accept = fieldMeta.accept;
            if (required) inp.required = true;

            const design = document.createElement('div');
            design.className = 'file-upload-design';
            const hintText = fieldMeta.multiple ? 'Multiple files supported' : (fieldMeta.accept || 'Any file type');
            design.innerHTML = `
                <i data-lucide="upload-cloud"></i>
                <span><strong>Click to upload</strong> or drag &amp; drop</span>
                <span class="file-upload-hint">${hintText}</span>`;

            inp.addEventListener('change', () => {
                const files = [...inp.files];
                if (files.length === 0) return;
                const names = files.map(f => f.name).join(', ');
                design.innerHTML = `
                    <i data-lucide="file-check"></i>
                    <span style="font-weight:600;color:var(--accent)">${files.length > 1 ? files.length + ' files selected' : names}</span>
                    <span class="file-upload-hint">${files.length > 1 ? names : ''}</span>`;
                if (window.lucide) lucide.createIcons();
            });

            wrapper.addEventListener('dragover', e => { e.preventDefault(); wrapper.classList.add('drag-over'); });
            wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drag-over'));
            wrapper.addEventListener('drop', () => wrapper.classList.remove('drag-over'));

            wrapper.appendChild(inp);
            wrapper.appendChild(design);
            group.appendChild(wrapper);
            addHelp(group, desc);
            return group;
        }

        // Custom widget overrides: Textarea
        if (metaType === 'textarea') {
            const group = makeGroup(fullId, label, required, true);
            const ta = document.createElement('textarea');
            ta.id = fullId;
            ta.name = fullId;
            ta.placeholder = desc || '';
            ta.rows = fieldMeta.rows || 4;
            if (defaultVal !== undefined && defaultVal !== null) ta.value = defaultVal;
            if (required) ta.required = true;
            group.appendChild(ta);
            addHelp(group, desc);
            return group;
        }

        // Const value field (readonly display badge)
        if ('const' in fieldSchema || 'const' in effectiveSchema) {
            const constVal = fieldSchema.const !== undefined ? fieldSchema.const : effectiveSchema.const;
            const group = makeGroup(fullId, label, false);
            const badge = document.createElement('span');
            badge.className = 'const-field';
            badge.innerHTML = `<i data-lucide="lock" style="width:13px;height:13px;"></i> ${constVal}`;

            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = fullId;
            hidden.value = constVal;
            group.appendChild(badge);
            group.appendChild(hidden);
            addHelp(group, desc);
            return group;
        }

        // Enum or Boolean select field
        if (effectiveSchema.enum || effectiveSchema.type === 'boolean') {
            const group = makeGroup(fullId, label, required);
            const sel = document.createElement('select');
            sel.id = fullId;
            sel.name = fullId;
            if (required) sel.required = true;
            sel.innerHTML = `<option value="">Select ${label}...</option>`;

            const opts = effectiveSchema.enum || [true, false];
            opts.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = typeof v === 'boolean' ? (v ? 'True' : 'False') : v;
                if (defaultVal === v || String(defaultVal) === String(v)) opt.selected = true;
                sel.appendChild(opt);
            });
            group.appendChild(sel);
            addHelp(group, desc);
            return group;
        }

        // Array value collection field
        if (effectiveSchema.type === 'array') {
            const group = makeGroup(fullId, label, required, true);
            const wrapper = document.createElement('div');
            wrapper.className = 'array-input-wrapper';
            const row = document.createElement('div');
            row.className = 'array-input-row';
            const arrInput = document.createElement('input');
            arrInput.type = 'text';
            arrInput.placeholder = 'Type a value and press Add';
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'btn-secondary';
            addBtn.textContent = '+ Add';
            row.appendChild(arrInput);
            row.appendChild(addBtn);
            const itemsList = document.createElement('div');
            itemsList.className = 'items-list';
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = fullId;
            hidden.value = '[]';
            wrapper.appendChild(row);
            wrapper.appendChild(itemsList);
            wrapper.appendChild(hidden);

            addBtn.addEventListener('click', () => {
                const val = arrInput.value.trim();
                if (!val) return;
                const curr = JSON.parse(hidden.value);
                curr.push(val);
                hidden.value = JSON.stringify(curr);
                const tag = document.createElement('span');
                tag.className = 'array-tag';
                tag.innerHTML = `${val} <i data-lucide="x" class="remove-item"></i>`;
                itemsList.appendChild(tag);
                tag.querySelector('.remove-item').addEventListener('click', () => {
                    const updated = JSON.parse(hidden.value).filter(v => v !== val);
                    hidden.value = JSON.stringify(updated);
                    tag.remove();
                });
                arrInput.value = '';
                if (window.lucide) lucide.createIcons();
            });

            group.appendChild(wrapper);
            addHelp(group, desc);
            return group;
        }

        // Standard HTML inputs (datetime, date, color, email, url, password, number, text)
        const standardInputTypes = {
            'datetime': 'datetime-local',
            'date': 'date',
            'color': 'color',
            'email': 'email',
            'url': 'url',
            'password': 'password',
            'integer': 'number',
            'number': 'number',
            'string': 'text'
        };

        const inputType = standardInputTypes[metaType] || standardInputTypes[effectiveSchema.type] || 'text';

        const group = makeGroup(fullId, label, required);
        const inp = document.createElement('input');
        inp.type = inputType;
        inp.id = fullId;
        inp.name = fullId;
        inp.placeholder = desc || '';
        if (required) inp.required = true;
        if (inputType === 'color') {
            inp.value = defaultVal || '#000000';
        } else if (defaultVal !== undefined && defaultVal !== null) {
            inp.value = defaultVal;
        }
        group.appendChild(inp);
        addHelp(group, desc);
        return group;
    }

    // ─── Render a flat object's properties into a grid ─────────────────────────
    function buildObjectFields(objSchema, defs, container, namePrefix = '', skipKeys = []) {
        if (!objSchema || !objSchema.properties) return;
        const props = objSchema.properties;
        const reqList = objSchema.required || [];
        const grid = document.createElement('div');
        grid.className = 'fields-grid';
        const metaFields = (window.TOOL_META && window.TOOL_META.fields) || {};

        console.log("props:", props)
        console.log("window.TOOL_META.fields:", window.TOOL_META.fields)


        Object.entries(props).forEach(([name, fieldSchema]) => {
            const fullId = namePrefix ? `${namePrefix}.${name}` : name;
            const dotId = fullId;
            console.log("props fieldsceham:", fieldSchema)
            console.log("props name:", name)

            let resolved = fieldSchema;
            if (fieldSchema.$ref) {
                resolved = resolveDef(fieldSchema.$ref, defs) || fieldSchema;
            }

            // Nest connection check: We no longer do this by matching schema here.
            // Connections are handled globally and inside discriminators via c.dependency.

            const shouldSkip = !isAlwaysShow(name, fullId, dotId) && skipKeys.some(sk =>
                fieldsMatch(name, sk) || fieldsMatch(fullId, sk) || fieldsMatch(dotId, sk)
            );
            if (shouldSkip) return;

            let nestedResolved = resolved;
            if (nestedResolved.anyOf) {
                const nonNullSchema = nestedResolved.anyOf.find(s => s.type !== 'null');
                console.log("nestedResolved.title:", nestedResolved.display_title)
                if (nonNullSchema) {
                    nestedResolved = {
                        ...nonNullSchema,
                        title: nestedResolved.display_title,
                        description: nestedResolved.description,
                        default: nestedResolved.default
                    };
                    if (nestedResolved.$ref) {
                        nestedResolved = {
                            ...(resolveDef(nestedResolved.$ref, defs) || nestedResolved),
                            title: nestedResolved.display_title,
                            description: nestedResolved.description,
                            default: nestedResolved.default
                        };
                    }
                }
            }
            if (nestedResolved.$ref) {
                nestedResolved = resolveDef(nestedResolved.$ref, defs) || nestedResolved;
            }

            if (!nestedResolved.discriminator && nestedResolved.oneOf) {
                nestedResolved.discriminator = { propertyName: detectDiscriminator(nestedResolved, defs) };
            }

            if (nestedResolved.discriminator || nestedResolved.oneOf) {
                const nestedSection = document.createElement('div');
                nestedSection.className = 'nested-discriminator-section';
                const nestedTitle = document.createElement('h3');
                nestedTitle.className = 'section-title';
                nestedTitle.textContent = nestedResolved.display_title || nestedResolved.title || name;
                nestedSection.appendChild(nestedTitle);

                buildDiscriminatedUnion(nestedResolved, defs, nestedSection, 1, skipKeys, activeConnections, fullId);
                grid.appendChild(nestedSection);
                return;
            }

            if (nestedResolved.properties && (nestedResolved.type === 'object' || !nestedResolved.type)) {
                const nestedSection = document.createElement('div');
                nestedSection.className = 'nested-object-section';
                const nestedTitle = document.createElement('h4');
                nestedTitle.className = 'section-sub-title';
                nestedTitle.textContent = nestedResolved.display_title || name;
                nestedSection.appendChild(nestedTitle);

                buildObjectFields(nestedResolved, defs, nestedSection, fullId, skipKeys);
                grid.appendChild(nestedSection);
                return;
            }

            const fieldMeta = resolveFieldMeta(name, metaFields);
            console.log("fieldMeta:", fieldMeta)
            console.log("nestedResolved:", nestedResolved)
            const fieldEl = buildField(name, nestedResolved, reqList, defs, namePrefix, fieldMeta);
            if (fieldEl) grid.appendChild(fieldEl);
        });

        container.appendChild(grid);
    }

    // ─── Post-render sweep helper ───────────────────────────────────────────────
    function sweepSkipFields(container, skipFields) {
        if (!skipFields || skipFields.length === 0) return;

        container.querySelectorAll(`[data-field-name]`).forEach(el => {
            const nameAttr = el.dataset.fieldName;
            if (!nameAttr || isAlwaysShow(nameAttr) || nameAttr.startsWith('connection_name')) return;

            const shouldRemove = skipFields.some(sf => !isAlwaysShow(sf) && fieldsMatch(nameAttr, sf));
            if (shouldRemove) {
                el.remove();
            }
        });

        container.querySelectorAll('.schema-section, .op-fields-section').forEach(section => {
            if (!section.querySelector('.form-group') && !section.querySelector('.discriminator-step')) {
                section.remove();
            }
        });
    }

    // ─── Discriminated Union Renderer ──────────────────────────────────────────
    function buildDiscriminatedUnion(payloadSchema, defs, container, level = 1, skipFields = [], connections = [], namePrefix = '') {
        const discriminator = payloadSchema.discriminator;
        if (!discriminator) {
            console.warn("[MCP Form] buildDiscriminatedUnion: no discriminator defined");
            return false;
        }

        const propName = discriminator.propertyName;
        const fullId = namePrefix ? `${namePrefix}.${propName}` : propName;
        let mapping = discriminator.mapping || {};

        console.log("[MCP Form] buildDiscriminatedUnion for:", fullId, "propName:", propName);

        if ((!mapping || Object.keys(mapping).length === 0) && payloadSchema.oneOf) {
            mapping = {};
            payloadSchema.oneOf.forEach((schema, idx) => {
                let resolvedSchema = schema;
                if (schema.$ref) {
                    resolvedSchema = resolveDef(schema.$ref, defs) || schema;
                }
                const discField = resolvedSchema.properties?.[propName];
                console.log(`[MCP Form] sub-schema index ${idx} properties:`, resolvedSchema.properties, "discField:", discField);
                if (!discField) return;

                if (discField.const !== undefined && discField.const !== null) {
                    mapping[discField.const] = schema;
                } else if (discField.enum && Array.isArray(discField.enum)) {
                    discField.enum.forEach(val => {
                        if (val !== undefined && val !== null) {
                            mapping[val] = schema;
                        }
                    });
                }
            });
        }

        const options = Object.keys(mapping);

        const step = document.createElement('div');
        step.className = 'discriminator-step';

        const stepLabel = document.createElement('div');
        stepLabel.className = 'step-label';
        stepLabel.innerHTML = `<span class="step-badge">${level}</span> Select ${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
        step.appendChild(stepLabel);

        const sel = document.createElement('select');
        sel.id = `disc_${propName}_${level}`;
        sel.name = fullId;
        sel.innerHTML = `<option value="">Choose ${propName}...</option>`;
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            sel.appendChild(o);
        });
        step.appendChild(sel);
        container.appendChild(step);

        const nested = document.createElement('div');
        nested.id = `disc_nested_${propName}_${level}`;
        container.appendChild(nested);

        sel.addEventListener('change', () => {
            nested.innerHTML = '';
            const chosen = sel.value;
            if (!chosen) return;

            const mappingValue = mapping[chosen];
            if (!mappingValue) return;

            const mergedSkip = [propName, ...skipFields.filter(f => f !== propName)];

            const ref = typeof mappingValue === 'string' ? mappingValue : mappingValue.$ref;
            const def = ref ? resolveDef(ref, defs) : mappingValue;
            if (!def) return;

            if (def.discriminator || def.oneOf) {
                buildDiscriminatedUnion(def, defs, nested, level + 1, skipFields, connections, namePrefix);
            } else {
                const section = document.createElement('div');
                section.className = 'op-fields-section';
                const title = document.createElement('h3');
                title.className = 'section-title';
                title.textContent = def.title || chosen;
                section.appendChild(title);

                connections.forEach(c => {
                    // const shouldInclude = connectionMatchesSchemaContext(c, chosen, def, namePrefix);
                    const shouldInclude = connectionMatchesSchemaContext(c, chosen, def, fullId);

                    if (shouldInclude) {
                        const connName =
                            connections.length > 1
                                ? `connection_name_${(c.type || 'service').toLowerCase()}`
                                : 'connection_name';

                        section.appendChild(
                            makeConnectionDropdown(c, connName)
                        );
                    }
                });

                buildObjectFields(def, defs, section, namePrefix, mergedSkip);
                nested.appendChild(section);
                sweepSkipFields(nested, skipFields);
            }
            if (window.lucide) lucide.createIcons();
        });

        return true;
    }

    // ─── Main render entry point ────────────────────────────────────────────────
    function renderForm(schema) {
        root.innerHTML = '';
        if (!schema || Object.keys(schema).length === 0) {
            root.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:2rem;">This tool has no input parameters.</p>';
            return;
        }

        const properties = schema.properties || {};
        const meta = window.TOOL_META || {};
        let skipFields = [];
        let connections = [];

        if (meta.connection_name) {
            const rawConns = Array.isArray(meta.connection_name) ? meta.connection_name : [meta.connection_name];
            connections = rawConns.map(c => {
                const rawFields = c.fields || Object.keys(c).filter(k => k !== 'type' && k !== 'fields' && k !== 'dependency' && k !== 'sub_dependency');
                const fields = Array.isArray(rawFields) ? rawFields : String(rawFields).split(',').map(s => s.trim()).filter(Boolean);
                fields.forEach(f => { if (!skipFields.includes(f)) skipFields.push(f); });
                return { ...c, fields };
            });
            activeConnections = connections;

            connections.forEach(c => {
                if (!c.dependency) {
                    const connSection = document.createElement('div');
                    connSection.className = 'schema-section connection-section';
                    const h3 = document.createElement('h3');
                    h3.className = 'section-title';
                    h3.innerHTML = `<i data-lucide="link" style="width:16px;height:16px;vertical-align:middle;margin-right:8px;"></i>${c.type || 'Service'} Connection`;
                    connSection.appendChild(h3);

                    const connName = connections.length > 1 ? `connection_name_${(c.type || 'service').toLowerCase()}` : 'connection_name';
                    connSection.appendChild(makeConnectionDropdown(c, connName));
                    root.appendChild(connSection);
                }
            });
        }

        const rawHidden = meta.hidden_properties || meta.hidden_property;
        if (rawHidden) {
            let hiddenList = [];
            if (Array.isArray(rawHidden)) {
                hiddenList = rawHidden.map(s => String(s).trim()).filter(Boolean);
            } else if (typeof rawHidden === 'string') {
                hiddenList = rawHidden.split(',').map(s => s.trim()).filter(Boolean);
            } else if (typeof rawHidden === 'object' && rawHidden !== null) {
                hiddenList = Object.keys(rawHidden).map(s => String(s).trim()).filter(Boolean);
            }
            hiddenList.forEach(f => { if (!skipFields.includes(f)) skipFields.push(f); });
        }

        updateMetadataDisplay(skipFields);

        const defs = schema.$defs ||
            schema.definitions ||
            (schema.properties && (schema.properties.$defs || schema.properties.definitions)) ||
            {};
        const required = schema.required || [];

        Object.entries(properties).forEach(([propName, propSchema]) => {
            let resolved = propSchema;
            if (propSchema.$ref) {
                resolved = resolveDef(propSchema.$ref, defs) || propSchema;
            }

            // Connection checking at this level is handled globally via dependencies above.

            if (skipFields.includes(propName) && !isAlwaysShow(propName)) return;

            if (resolved.anyOf) {
                const nonNullSchema = resolved.anyOf.find(s => s.type !== 'null');
                if (nonNullSchema) {
                    resolved = nonNullSchema;
                    if (resolved.$ref) {
                        resolved = resolveDef(resolved.$ref, defs) || resolved;
                    }
                }
            }

            if (!resolved.discriminator && resolved.oneOf) {
                resolved.discriminator = { propertyName: detectDiscriminator(resolved, defs) };
            }

            if (resolved.discriminator || (resolved.oneOf && resolved.discriminator)) {
                const section = document.createElement('div');
                section.className = 'schema-section';
                root.appendChild(section);
                buildDiscriminatedUnion(resolved, defs, section, 1, skipFields, connections, propName);
                return;
            }

            if (resolved.properties && (resolved.type === 'object' || !resolved.type)) {
                const section = document.createElement('div');
                section.className = 'schema-section';
                const h3 = document.createElement('h3');
                h3.className = 'section-title';
                h3.textContent = resolved.title || propName;
                section.appendChild(h3);
                buildObjectFields(resolved, defs, section, propName, skipFields);
                root.appendChild(section);
                return;
            }

            const section = document.createElement('div');
            section.className = 'schema-section';
            console.log("resolved:", resolved)
            const fieldMeta = resolveFieldMeta(propName, meta.fields);
            const fieldEl = buildField(propName, resolved, required, defs, '', fieldMeta);
            if (fieldEl) section.appendChild(fieldEl);
            root.appendChild(section);
        });

        sweepSkipFields(root, skipFields);
        if (window.lucide) lucide.createIcons();
    }

    // ─── Collect nested form values ─────────────────────────────────────────────
    function collectFormData() {
        Object.values(quillInstances).forEach(({ quill, hidden }) => {
            hidden.value = quill.root.innerHTML;
        });

        const formData = new FormData(toolForm);
        const nested = {};
        formData.forEach((value, key) => {
            if (!key) return;
            let parsed = value;

            if (value instanceof File) {
                if (!value.name) return;
                parsed = value.name;
            } else {
                try { parsed = JSON.parse(value); } catch (_) { }
            }

            const parts = key.split('.');
            let current = nested;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    if (key.endsWith('attachments') || key.endsWith('files')) {
                        current[part] = current[part] || [];
                        current[part].push(parsed);
                    } else {
                        current[part] = parsed;
                    }
                } else {
                    if (!current[part]) {
                        current[part] = {};
                    }
                    current = current[part];
                }
            }
        });
        return nested;
    }

    // ─── Form submit ────────────────────────────────────────────────────────────
    toolForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-btn');
        const orig = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> <span>Running...</span>';

        try {
            const payload = collectFormData();
            const response = await fetch(toolForm.action, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            resultPayload.textContent = JSON.stringify(data, null, 2);
            modal.classList.add('active');
        } catch (err) {
            resultPayload.textContent = JSON.stringify({ error: err.message }, null, 2);
            modal.classList.add('active');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = orig;
            if (window.lucide) lucide.createIcons();
        }
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    // ─── Dynamic Dependencies ───────────────────────────────────────────────────
    function setupDependencies() {
        const meta = window.TOOL_META || {};
        if (!meta.dependencies || !Array.isArray(meta.dependencies)) return;

        root.addEventListener('change', async (e) => {
            if (!e.target || !e.target.name) return;
            const targetName = e.target.name;

            for (const dep of meta.dependencies) {
                const on_change = dep.on_change || [];
                const on_value = dep.on_value;
                const action = dep.action;
                const dependent_value = dep.dependent_value;

                if (!on_value || !action) continue;

                const triggered = on_change.some(triggerName => fieldsMatch(targetName, triggerName));
                if (triggered) {
                    const connSelects = Array.from(document.querySelectorAll('select[name^="Credential"], select[name^="connection_name"], select[name="connection_id"]'));
                    const activeConnSelect = connSelects.find(s => s.offsetParent !== null && s.value);
                    const connection_id = activeConnSelect ? activeConnSelect.value : null;

                    if (dependent_value) {
                        const allInputs = Array.from(root.querySelectorAll('input, select, textarea'));
                        const depElements = allInputs.filter(el => fieldsMatch(el.name, dependent_value));
                        depElements.forEach(el => {
                            if (el.tagName === 'SELECT') {
                                el.innerHTML = `<option value="">Select ${dependent_value}...</option>`;
                            } else {
                                el.value = '';
                            }
                        });
                    }

                    const allInputs = Array.from(root.querySelectorAll('input, select, textarea'));
                    const targetElements = allInputs.filter(el => fieldsMatch(el.name, on_value));

                    targetElements.forEach(el => {
                        if (el.tagName === 'SELECT') {
                            el.innerHTML = `<option value="">Loading options...</option>`;
                        } else {
                            const sel = document.createElement('select');
                            sel.id = el.id;
                            sel.name = el.name;
                            sel.className = el.className;
                            sel.required = el.required;
                            sel.innerHTML = `<option value="">Loading options...</option>`;
                            el.parentNode.replaceChild(sel, el);
                        }
                    });

                    const triggerKey = targetName.includes('.') ? targetName.split('.').pop() : targetName.split('_').pop();
                    const payload = {
                        connection_id: connection_id,
                        action: action,
                        params: {
                            [triggerKey]: e.target.value
                        }
                    };

                    try {
                        const response = await fetch('/api/connection-actions/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        if (!response.ok) throw new Error(`HTTP ${response.status}`);

                        const resData = await response.json();
                        let optionsList = [];
                        if (resData.data && resData.data.result) {
                            if (Array.isArray(resData.data.result)) {
                                optionsList = resData.data.result;
                            } else {
                                for (const key in resData.data.result) {
                                    if (Array.isArray(resData.data.result[key])) {
                                        optionsList = resData.data.result[key];
                                        break;
                                    }
                                }
                            }
                        }

                        if (optionsList.length === 0) {
                            if (resData.data && Array.isArray(resData.data)) {
                                optionsList = resData.data;
                            } else if (Array.isArray(resData)) {
                                optionsList = resData;
                            }
                        }

                        const latestInputs = Array.from(root.querySelectorAll('input, select, textarea'));
                        const updatedTargetElements = latestInputs.filter(el => fieldsMatch(el.name, on_value));

                        updatedTargetElements.forEach(el => {
                            el.innerHTML = `<option value="">Select ${on_value}...</option>`;
                            optionsList.forEach(opt => {
                                const optionEl = document.createElement('option');
                                if (typeof opt === 'object' && opt !== null) {
                                    optionEl.value = opt.id || opt.value || opt.name;
                                    optionEl.textContent = opt.displayName || opt.name || opt.label || opt.value || opt.id;
                                } else {
                                    optionEl.value = opt;
                                    optionEl.textContent = opt;
                                }
                                el.appendChild(optionEl);
                            });
                        });
                    } catch (err) {
                        const latestInputs = Array.from(root.querySelectorAll('input, select, textarea'));
                        const updatedTargetElements = latestInputs.filter(el => fieldsMatch(el.name, on_value));
                        updatedTargetElements.forEach(el => {
                            el.innerHTML = `<option value="">Error loading options</option>`;
                        });
                    }
                }
            }
        });
    }

    renderForm(schema);
    setupDependencies();
    setupMetadataUI();
});
