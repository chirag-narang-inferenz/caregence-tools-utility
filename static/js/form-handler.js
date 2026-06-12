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
        const fullId = namePrefix ? `${namePrefix}_${name}` : name;

        let effectiveSchema = fieldSchema;
        if (fieldSchema.anyOf) {
            const nonNull = fieldSchema.anyOf.find(s => s.type !== 'null');
            if (nonNull) effectiveSchema = { ...nonNull, description: fieldSchema.description, title: fieldSchema.title, default: fieldSchema.default };
        }

        const label = effectiveSchema.title || fieldSchema.title || name;
        const desc = effectiveSchema.description || fieldSchema.description || '';
        const defaultVal = effectiveSchema.default !== undefined ? effectiveSchema.default : fieldSchema.default;

        const metaType = fieldMeta.type;

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

        Object.entries(props).forEach(([name, fieldSchema]) => {
            const fullId = namePrefix ? `${namePrefix}_${name}` : name;
            const dotId = namePrefix ? `${namePrefix.replace(/_/g, '.')}.${name}` : name;

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
                if (nonNullSchema) {
                    nestedResolved = {
                        ...nonNullSchema,
                        title: nestedResolved.title,
                        description: nestedResolved.description,
                        default: nestedResolved.default
                    };
                    if (nestedResolved.$ref) {
                        nestedResolved = {
                            ...(resolveDef(nestedResolved.$ref, defs) || nestedResolved),
                            title: nestedResolved.title,
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
                nestedResolved.discriminator = { propertyName: "type" };
            }

            if (nestedResolved.discriminator || nestedResolved.oneOf) {
                const nestedSection = document.createElement('div');
                nestedSection.className = 'nested-discriminator-section';
                const nestedTitle = document.createElement('h3');
                nestedTitle.className = 'section-title';
                nestedTitle.textContent = nestedResolved.title || name;
                nestedSection.appendChild(nestedTitle);

                buildDiscriminatedUnion(nestedResolved, defs, nestedSection, 1, skipKeys, activeConnections);
                grid.appendChild(nestedSection);
                return;
            }

            const fieldMeta = metaFields[name] || {};
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
    function buildDiscriminatedUnion(payloadSchema, defs, container, level = 1, skipFields = [], connections = []) {
        const discriminator = payloadSchema.discriminator;
        if (!discriminator) return false;

        const propName = discriminator.propertyName;
        let mapping = discriminator.mapping || {};

        if ((!mapping || Object.keys(mapping).length === 0) && payloadSchema.oneOf) {
            mapping = {};
            payloadSchema.oneOf.forEach(schema => {
                let resolvedSchema = schema;
                if (schema.$ref) {
                    resolvedSchema = resolveDef(schema.$ref, defs) || schema;
                }
                const discField = resolvedSchema.properties?.[propName];
                if (!discField) return;

                let discValue = discField.const !== undefined ? discField.const : (discField.enum && discField.enum[0]);
                if (discValue) {
                    mapping[discValue] = schema;
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
        sel.name = propName;
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
                buildDiscriminatedUnion(def, defs, nested, level + 1, skipFields, connections);
            } else {
                const section = document.createElement('div');
                section.className = 'op-fields-section';
                const title = document.createElement('h3');
                title.className = 'section-title';
                title.textContent = def.title || chosen;
                section.appendChild(title);

                const subSchemaFields = Object.keys(def.properties || {});
                console.log("chosen:", chosen);
                console.log("schema title:", def.title);

                connections.forEach(c => {

                    let shouldInclude =
                        c.dependency &&
                        slugify(c.dependency) === slugify(chosen);

                    if (shouldInclude && c.sub_dependency) {
                        shouldInclude =
                            slugify(c.sub_dependency) ===
                            slugify(def.title || chosen);
                    }

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
                // connections.forEach(c => {
                //     const shouldInclude = c.dependency && slugify(c.dependency) === slugify(chosen);
                //     if (shouldInclude) {
                //         const connName = connections.length > 1 ? `connection_name_${(c.type || 'service').toLowerCase()}` : 'connection_name';
                //         section.appendChild(makeConnectionDropdown(c, connName));
                //     }
                // });

                buildObjectFields(def, defs, section, '', mergedSkip);
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
                const rawFields = c.fields || Object.keys(c).filter(k => k !== 'type' && k !== 'fields' && k !== 'dependency');
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
                resolved.discriminator = { propertyName: "type" };
            }

            if (resolved.discriminator || (resolved.oneOf && resolved.discriminator)) {
                const section = document.createElement('div');
                section.className = 'schema-section';
                root.appendChild(section);
                buildDiscriminatedUnion(resolved, defs, section, 1, skipFields, connections);
                return;
            }

            if (resolved.properties && (resolved.type === 'object' || !resolved.type)) {
                const section = document.createElement('div');
                section.className = 'schema-section';
                const h3 = document.createElement('h3');
                h3.className = 'section-title';
                h3.textContent = resolved.title || propName;
                section.appendChild(h3);
                buildObjectFields(resolved, defs, section, '', skipFields);
                root.appendChild(section);
                return;
            }

            const section = document.createElement('div');
            section.className = 'schema-section';
            const fieldEl = buildField(propName, resolved, required, defs);
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
        const flat = {};
        formData.forEach((value, key) => {
            let parsed = value;
            try { parsed = JSON.parse(value); } catch (_) { }
            flat[key] = parsed;
        });
        return flat;
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

                    const triggerKey = targetName.split('_').pop();
                    const payload = {
                        connection_id: connection_id,
                        action: action,
                        params: {
                            [triggerKey]: e.target.value
                        }
                    };

                    try {
                        const response = await fetch('https://dev-api.caregence.ai/api/connection-actions/execute', {
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
