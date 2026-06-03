document.addEventListener('DOMContentLoaded', () => {
    // Registry of Quill instances keyed by field id, for flush-before-submit
    const quillInstances = {};
    const schema = window.TOOL_SCHEMA || {};
    const root = document.getElementById('schema-form-root');
    const modal = document.getElementById('result-modal');
    const closeBtn = document.querySelector('.close-modal');
    const resultPayload = document.getElementById('result-payload');
    const toolForm = document.getElementById('tool-form');

    function slugify(s) {
        return String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }

    // ─── Resolve $ref ──────────────────────────────────────────────────────────
    function resolveDef(ref, defs) {
        if (!ref) return null;
        const key = ref.split('/').pop();
        return defs[key] || null;
    }

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

    function makeConnectionDropdown(connMeta, name = 'connection_id') {
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
            const opt = document.createElement('option');
            opt.value = c.id;
            // Highlight the type in the dropdown text
            opt.textContent = `${c.connection_name} [${c.connection_type}]`;
            
            // Optional: If you want to auto-select or highlight exact matches, you can do it here.
            // For now, we list all available connections because the types might differ slightly.
            sel.appendChild(opt);
        });

        group.appendChild(sel);
        return group;
    }

    // ─── Build field for a single property ─────────────────────────────────────
    function buildField(name, fieldSchema, requiredList, defs, namePrefix = '', fieldMeta = {}) {
        const required = requiredList && requiredList.includes(name);
        // const fullId = namePrefix ? `${namePrefix}__${name}` : name;
        const fullId = namePrefix ? `${namePrefix}_${name}` : name;

        // Resolve anyOf with null → optional field
        let effectiveSchema = fieldSchema;
        if (fieldSchema.anyOf) {
            const nonNull = fieldSchema.anyOf.find(s => s.type !== 'null');
            if (nonNull) effectiveSchema = { ...nonNull, description: fieldSchema.description, title: fieldSchema.title, default: fieldSchema.default };
        }

        const label = effectiveSchema.title || fieldSchema.title || name;
        const desc = effectiveSchema.description || fieldSchema.description || '';
        const defaultVal = effectiveSchema.default !== undefined ? effectiveSchema.default : fieldSchema.default;

        // ── meta.fields type override ─────────────────────────────────────────
        // If meta.fields[name].type is set, render the appropriate input widget
        // and return early — before the schema-driven type checks below.
        const metaType = fieldMeta.type;
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

            // Update the label when files are selected
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

            // Drag-and-drop visual feedback
            wrapper.addEventListener('dragover', e => { e.preventDefault(); wrapper.classList.add('drag-over'); });
            wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drag-over'));
            wrapper.addEventListener('drop', () => wrapper.classList.remove('drag-over'));

            wrapper.appendChild(inp);
            wrapper.appendChild(design);
            group.appendChild(wrapper);
            addHelp(group, desc);
            return group;
        }
        if (metaType === 'datetime') {
            const group = makeGroup(fullId, label, required);
            const inp = document.createElement('input');
            inp.type = 'datetime-local';
            inp.id = fullId;
            inp.name = fullId;
            if (defaultVal) inp.value = defaultVal;
            if (required) inp.required = true;
            group.appendChild(inp);
            addHelp(group, desc);
            return group;
        }
        if (metaType === 'date') {
            const group = makeGroup(fullId, label, required);
            const inp = document.createElement('input');
            inp.type = 'date';
            inp.id = fullId;
            inp.name = fullId;
            if (defaultVal) inp.value = defaultVal;
            if (required) inp.required = true;
            group.appendChild(inp);
            addHelp(group, desc);
            return group;
        }
        if (metaType === 'color') {
            const group = makeGroup(fullId, label, required);
            const inp = document.createElement('input');
            inp.type = 'color';
            inp.id = fullId;
            inp.name = fullId;
            inp.value = defaultVal || '#000000';
            group.appendChild(inp);
            addHelp(group, desc);
            return group;
        }
        if (metaType === 'email' || metaType === 'url' || metaType === 'password') {
            const group = makeGroup(fullId, label, required);
            const inp = document.createElement('input');
            inp.type = metaType;
            inp.id = fullId;
            inp.name = fullId;
            inp.placeholder = desc || '';
            if (defaultVal !== undefined && defaultVal !== null) inp.value = defaultVal;
            if (required) inp.required = true;
            group.appendChild(inp);
            addHelp(group, desc);
            return group;
        }
        if (metaType === 'html') {
            const group = makeGroup(fullId, label, required, true);

            // Wrapper that Quill will attach to
            const editorWrapper = document.createElement('div');
            editorWrapper.className = 'quill-editor-wrapper';

            // The actual editable surface Quill mounts inside
            const editorDiv = document.createElement('div');
            editorDiv.className = 'quill-editor-surface';
            if (defaultVal) editorDiv.innerHTML = defaultVal;
            editorWrapper.appendChild(editorDiv);

            // Hidden input that carries the HTML value through FormData
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.id = fullId;
            hidden.name = fullId;
            hidden.value = defaultVal || '';
            editorWrapper.appendChild(hidden);

            group.appendChild(editorWrapper);
            addHelp(group, desc);

            // Initialise Quill after the element is in the DOM
            // (requestAnimationFrame ensures the element is painted first)
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

                // Sync HTML → hidden input on every change
                quill.on('text-change', () => {
                    hidden.value = quill.root.innerHTML;
                });

                // Register globally so submit handler can flush
                quillInstances[fullId] = { quill, hidden };
            });

            return group;
        }

        // const → read-only display badge
        if ('const' in fieldSchema || 'const' in effectiveSchema) {
            const constVal = fieldSchema.const !== undefined ? fieldSchema.const : effectiveSchema.const;
            const group = makeGroup(fullId, label, false);
            const badge = document.createElement('span');
            badge.className = 'const-field';
            badge.innerHTML = `<i data-lucide="lock" style="width:13px;height:13px;"></i> ${constVal}`;
            // Store as hidden so it's submitted
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = fullId;
            hidden.value = constVal;
            group.appendChild(badge);
            group.appendChild(hidden);
            addHelp(group, desc);
            return group;
        }

        // enum → select
        if (effectiveSchema.enum) {
            const group = makeGroup(fullId, label, required);
            const sel = document.createElement('select');
            sel.id = fullId;
            sel.name = fullId;
            if (required) sel.required = true;
            sel.innerHTML = `<option value="">Select ${label}...</option>`;
            effectiveSchema.enum.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                if (defaultVal === v) opt.selected = true;
                sel.appendChild(opt);
            });
            group.appendChild(sel);
            addHelp(group, desc);
            return group;
        }

        // boolean → select
        if (effectiveSchema.type === 'boolean') {
            const group = makeGroup(fullId, label, required);
            const sel = document.createElement('select');
            sel.id = fullId;
            sel.name = fullId;
            if (required) sel.required = true;
            sel.innerHTML = `
                <option value="">Select...</option>
                <option value="true" ${defaultVal === true ? 'selected' : ''}>True</option>
                <option value="false" ${defaultVal === false ? 'selected' : ''}>False</option>
            `;
            group.appendChild(sel);
            addHelp(group, desc);
            return group;
        }

        // integer / number
        if (effectiveSchema.type === 'integer' || effectiveSchema.type === 'number') {
            const group = makeGroup(fullId, label, required);
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.id = fullId;
            inp.name = fullId;
            inp.placeholder = desc || '';
            if (defaultVal !== undefined) inp.value = defaultVal;
            if (required) inp.required = true;
            group.appendChild(inp);
            addHelp(group, desc);
            return group;
        }

        // array
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

        // default: string text input
        const group = makeGroup(fullId, label, required);
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = fullId;
        inp.name = fullId;
        inp.placeholder = desc || '';
        if (defaultVal !== undefined && defaultVal !== null) inp.value = defaultVal;
        if (required) inp.required = true;
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
        // Lookup meta.fields once for this render pass
        const metaFields = (window.TOOL_META && window.TOOL_META.fields) || {};

        Object.entries(props).forEach(([name, fieldSchema]) => {
            // const fullId = namePrefix ? `${namePrefix}${name}` : name;
            const fullId = namePrefix ? `${namePrefix}_${name}` : name;
            const dotId = namePrefix ? `${namePrefix.replace(/_/g, '.')}.${name}` : name;
            // const dotId = namePrefix ? `${namePrefix.replace(/__/g, '.')}${name}` : name;
            
            const shouldSkip = skipKeys.some(sk => {
                const sSlug = slugify(sk);
                const nSlug = slugify(name);
                const fSlug = slugify(fullId);
                const dSlug = slugify(dotId);
                return sSlug === nSlug || 
                       sSlug === fSlug || 
                       sSlug === dSlug || 
                       sSlug.endsWith('__' + nSlug) || 
                       sSlug.endsWith('.' + nSlug) ||
                       nSlug.endsWith('__' + sSlug) ||
                       nSlug.endsWith('.' + sSlug);
            });
            if (shouldSkip) return;
            // Resolve $ref
            let resolved = fieldSchema;
            if (fieldSchema.$ref) {
                resolved = resolveDef(fieldSchema.$ref, defs) || fieldSchema;
            }

            // Handle nested discriminated unions
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

            // Auto inject discriminator
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
                
                buildDiscriminatedUnion(nestedResolved, defs, nestedSection, 1, skipKeys, []);
                grid.appendChild(nestedSection);
                return; // Skip normal field rendering
            }

            // Pass per-field meta (e.g. { type: 'file', multiple: true })
            const fieldMeta = metaFields[name] || {};
            const fieldEl = buildField(name, nestedResolved, reqList, defs, namePrefix, fieldMeta);
            if (fieldEl) grid.appendChild(fieldEl);
        });

        container.appendChild(grid);
    }

    // ─── Post-render sweep helper ───────────────────────────────────────────────
    // Removes any rendered form groups whose field name is in skipFields.
    // Called both after initial render and after every dynamic discriminated-union re-render.
    function sweepSkipFields(container, skipFields) {
        if (!skipFields || skipFields.length === 0) return;
        skipFields.forEach(fieldName => {
            const fSlug = slugify(fieldName);
            container.querySelectorAll(`[data-field-name]`).forEach(el => {
                const nameAttr = el.dataset.fieldName;
                if (!nameAttr) return;
                // const dotNameAttr = nameAttr.replace(/__/g, '.');
                const dotNameAttr = nameAttr.replace(/_/g, '.')

                // const rawName = nameAttr.split('__').pop();
                const rawName = nameAttr.split('_').pop();
                const nSlug = slugify(nameAttr);
                const dnSlug = slugify(dotNameAttr);
                const rSlug = slugify(rawName);
                
                if (nSlug === fSlug || 
                    dnSlug === fSlug || 
                    rSlug === fSlug || 
                    fSlug.endsWith('_' + nSlug) || 
                    fSlug.endsWith('.' + nSlug) ||
                    nSlug.endsWith('_' + fSlug) ||
                    nSlug.endsWith('.' + fSlug)) {
                    el.remove();
                }
            });
        });
        // Remove any sections / op-fields-sections left empty after the sweep
        container.querySelectorAll('.schema-section, .op-fields-section').forEach(section => {
            const grid = section.querySelector('.fields-grid');
            if (grid && grid.children.length === 0) section.remove();
        });
    }

    // ─── Discriminated Union Renderer ──────────────────────────────────────────
    // Handles schemas with discriminator.propertyName and oneOf / mapping.
    // skipFields is propagated so credential fields are hidden on every re-render.
    function buildDiscriminatedUnion(payloadSchema, defs, container, level = 1, skipFields = [], connections = []) {
        const discriminator = payloadSchema.discriminator;
        if (!discriminator) return false;

        const propName = discriminator.propertyName; // e.g. "platform"
        let mapping = discriminator.mapping || {};

        // Auto-build mapping from oneOf if missing (Pydantic often emits oneOf without mapping)
        if ((!mapping || Object.keys(mapping).length === 0) && payloadSchema.oneOf) {
            mapping = {};
            payloadSchema.oneOf.forEach(schema => {
                let resolvedSchema = schema;
                if (schema.$ref) {
                    resolvedSchema = resolveDef(schema.$ref, defs) || schema;
                }
                const discField = resolvedSchema.properties?.[propName];
                if (!discField) return;

                let discValue = null;
                if (discField.const !== undefined) {
                    discValue = discField.const;
                } else if (discField.enum && discField.enum.length) {
                    discValue = discField.enum[0];
                }

                if (discValue) {
                    mapping[discValue] = schema;
                }
            });
        }

        const options = Object.keys(mapping);

        // Step container
        const step = document.createElement('div');
        step.className = 'discriminator-step';

        const stepLabel = document.createElement('div');
        stepLabel.className = 'step-label';
        stepLabel.innerHTML = `<span class="step-badge">${level}</span> Select ${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
        step.appendChild(stepLabel);

        // Select for the discriminator property
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

        // Placeholder where nested content will be inserted
        const nested = document.createElement('div');
        nested.id = `disc_nested_${propName}_${level}`;
        container.appendChild(nested);

        sel.addEventListener('change', () => {
            nested.innerHTML = '';
            const chosen = sel.value;
            if (!chosen) return;

            const mappingValue = mapping[chosen];
            if (!mappingValue) return;

            // Merge discriminator propName + caller's skipFields into one skip list
            const mergedSkip = [propName, ...skipFields.filter(f => f !== propName)];

            // mappingValue is either:
            // (a) a string "$ref" like "#/$defs/SomeModel"
            // (b) an object with another discriminator (nested level)
            if (typeof mappingValue === 'string') {
                // direct $ref → render its fields
                const def = resolveDef(mappingValue, defs);
                if (def) {
                    const section = document.createElement('div');
                    section.className = 'op-fields-section';
                    const title = document.createElement('h3');
                    title.className = 'section-title';
                    title.textContent = def.title || chosen;
                    section.appendChild(title);

                    // Contextual Connections based on dependency
                    connections.forEach(c => {
                        if (c.dependency === chosen) {
                            const connName = connections.length > 1 ? `connection_id_${(c.type || 'service').toLowerCase()}` : 'connection_id';
                            const connEl = makeConnectionDropdown(c, connName);
                            section.appendChild(connEl);
                        }
                    });

                    buildObjectFields(def, defs, section, '', mergedSkip);
                    nested.appendChild(section);
                    // Safety sweep: remove any remaining skip-fields after re-render
                    sweepSkipFields(nested, skipFields);
                    if (window.lucide) lucide.createIcons();
                }
            } else if (typeof mappingValue === 'object' && mappingValue.discriminator) {
                // Nested discriminated union (e.g. platform → then operation)
                buildDiscriminatedUnion(mappingValue, defs, nested, level + 1, skipFields, connections);
                if (window.lucide) lucide.createIcons();
            }
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

        const meta = window.TOOL_META || {};
        let skipFields = [];

        let connections = [];

        // Handle connection_name meta to replace fields with connection dropdown
        if (meta.connection_name) {
            const rawConns = Array.isArray(meta.connection_name) ? meta.connection_name : [meta.connection_name];
            connections = rawConns.map(c => {
                const rawFields = c.fields || Object.keys(c).filter(k => k !== 'type' && k !== 'fields' && k !== 'dependency');
                const fields = Array.isArray(rawFields) ? rawFields : String(rawFields).split(',').map(s => s.trim()).filter(Boolean);
                fields.forEach(f => { if (!skipFields.includes(f)) skipFields.push(f); });
                return { ...c, fields };
            });

            // Render top-level connections (no dependency)
            connections.forEach(c => {
                if (!c.dependency) {
                    const connSection = document.createElement('div');
                    connSection.className = 'schema-section connection-section';
                    const h3 = document.createElement('h3');
                    h3.className = 'section-title';
                    h3.innerHTML = `<i data-lucide="link" style="width:16px;height:16px;vertical-align:middle;margin-right:8px;"></i>${c.type || 'Service'} Connection`;
                    connSection.appendChild(h3);

                    const connName = connections.length > 1 ? `connection_id_${(c.type || 'service').toLowerCase()}` : 'connection_id';
                    const connEl = makeConnectionDropdown(c, connName);
                    connSection.appendChild(connEl);
                    root.appendChild(connSection);
                }
            });
        }

        // Also handle direct hidden_properties/hidden_property on the meta (e.g. "twilio_account_sid,twilio_auth_token,..." or ["twilio_account_sid", "twilio_auth_token"])
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

        const defs = schema.$defs || schema.definitions || {};
        const properties = schema.properties || {};
        const required = schema.required || [];

        // Iterate top-level properties
        Object.entries(properties).forEach(([propName, propSchema]) => {
            if (skipFields.includes(propName)) return;

            // Resolve $ref at top level
            let resolved = propSchema;
            if (propSchema.$ref) {
                resolved = resolveDef(propSchema.$ref, defs) || propSchema;
            }

            // Handle Optional[Union[...]] (Pydantic wraps unions inside anyOf)
            if (resolved.anyOf) {
                const nonNullSchema = resolved.anyOf.find(s => s.type !== 'null');
                if (nonNullSchema) {
                    resolved = nonNullSchema;
                    if (resolved.$ref) {
                        resolved = resolveDef(resolved.$ref, defs) || resolved;
                    }
                }
            }

            // Auto inject discriminator if missing
            if (!resolved.discriminator && resolved.oneOf) {
                resolved.discriminator = { propertyName: "type" };
            }

            // Check if this property is itself a discriminated union (oneOf + discriminator)
            if (resolved.discriminator || (resolved.oneOf && resolved.discriminator)) {
                const section = document.createElement('div');
                section.className = 'schema-section';
                root.appendChild(section);
                buildDiscriminatedUnion(resolved, defs, section, 1, skipFields, connections);
                return;
            }

            // Check if it's a plain object (also handle schemas that omit explicit "type":"object")
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

            // Flat field
            const section = document.createElement('div');
            section.className = 'schema-section';
            const fieldEl = buildField(propName, resolved, required, defs);
            if (fieldEl) section.appendChild(fieldEl);
            root.appendChild(section);
        });

        // ── Post-render safety sweep (initial render) ────────────────────────
        sweepSkipFields(root, skipFields);

        if (window.lucide) lucide.createIcons();
    }

    // ─── Collect nested form values ─────────────────────────────────────────────
    // Builds a nested JSON object from flat `name__subname` field convention
    function collectFormData() {
        // Flush all Quill editors to their hidden inputs before reading FormData
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

    // ─── Metadata Export Logic ──────────────────────────────────────────────────
    function generateDisplayProperties(schema, skipFields, meta) {
        const defs = schema.$defs || schema.definitions || {};

        function resolve(s) {
            return s.$ref ? (resolveDef(s.$ref, defs) || s) : s;
        }

        function shouldSkip(name, fullName) {
            const nSlug = slugify(name);
            const fSlug = slugify(fullName);
            const dotSlug = slugify(fullName.replace(/__/g, '.'));
            return skipFields.some(sf => {
                const sfSlug = slugify(sf);
                return sfSlug === nSlug || 
                       sfSlug === fSlug || 
                       sfSlug === dotSlug || 
                       sfSlug.endsWith('_' + nSlug) || 
                       sfSlug.endsWith('.' + nSlug) ||
                       nSlug.endsWith('_' + sfSlug) ||
                       nSlug.endsWith('.' + sfSlug);
            });
        }

        function getConnectionsFor(opValue = null) {
            if (!meta || !meta.connection_name) return [];
            const conns = Array.isArray(meta.connection_name) ? meta.connection_name : [meta.connection_name];
            let nodes = [];
            
            conns.forEach((c, idx) => {
                const shouldInclude = opValue === null ? !c.dependency : (slugify(c.dependency) === slugify(opValue));
                if (shouldInclude) {
                    const connType = c.type || meta.category || 'Service';
                    const displayConnType = Array.isArray(connType) ? connType.join(', ') : connType;
                    const propName = conns.length > 1 ? `Credential_${(c.type || idx).toString().replace(/\s+/g, '_')}` : "Credential";
                    
                    nodes.push({
                        "type": ["connection"],
                        "title": `Select ${displayConnType} Connection`,
                        "required": true,
                        "description": `Choose a ${displayConnType} connection...`,
                        "propertyName": propName,
                        "connection_value": connType
                    });
                }
            });
            return nodes;
        }


        function parseSchema(currentSchema, prefix = '', skipProp = null) {
            if (!currentSchema) return [];
            let resolved = resolve(currentSchema);
            let nodes = [];

            // Discriminator
            if (resolved.discriminator) {
                const propName = resolved.discriminator.propertyName;
                let mapping = resolved.discriminator.mapping || {};
                
                // Auto-build mapping if missing
                if (Object.keys(mapping).length === 0 && resolved.oneOf) {
                    resolved.oneOf.forEach(sub => {
                        let subRes = resolve(sub);
                        const discField = subRes.properties?.[propName];
                        if (discField) {
                            let discValue = discField.const || (discField.enum && discField.enum[0]);
                            if (discValue) {
                                mapping[discValue] = sub;
                            }
                        }
                    });
                }

                let discNode = {
                    name: propName,
                    propertyName: prefix + propName,
                    type: ['string'],
                    title: propName,
                    required: true,
                    enum: Object.keys(mapping),
                    isDiscriminator: true,
                    mapping: {}
                };

                Object.entries(mapping).forEach(([val, refSchema]) => {
                    const schemaToParse = typeof refSchema === 'string' ? { $ref: refSchema } : refSchema;
                    let childNodes = parseSchema(schemaToParse, prefix, propName);
                    let contextualConns = getConnectionsFor(val);
                    discNode.mapping[val] = [...contextualConns, ...childNodes];
                });
                
                nodes.push(discNode);
                return nodes;
            }

            // Normal properties
            if (resolved.properties) {
                const reqList = resolved.required || [];
                Object.entries(resolved.properties).forEach(([name, propSchema]) => {
                    if (name === skipProp) return; // Skip discriminator field in child

                    const fullName = prefix ? `${prefix}${name}` : name;
                    if (shouldSkip(name, fullName)) return;

                    let pResolved = resolve(propSchema);
                    
                    if (pResolved.anyOf) {
                        const nonNull = pResolved.anyOf.find(s => s.type !== 'null');
                        if (nonNull) {
                            pResolved = nonNull;
                            pResolved = resolve(pResolved);
                        }
                    }

                    if (!pResolved.discriminator && pResolved.oneOf) {
                        pResolved.discriminator = { propertyName: "type" };
                    }

                    let type = Array.isArray(pResolved.type) ? pResolved.type : (pResolved.type ? [pResolved.type] : ['string']);
                    const fieldMetaType = meta && meta.fields && meta.fields[name] && meta.fields[name].type;
                    if (fieldMetaType) type = [fieldMetaType];

                    let node = {
                        name: name,
                        propertyName: fullName,
                        type: type,
                        title: pResolved.title || name,
                        required: reqList.includes(name),
                        description: pResolved.description || '',
                    };
                    if (pResolved.enum) node.enum = pResolved.enum;
                    if (pResolved.default !== undefined) node.default = pResolved.default;
                    if (pResolved.const !== undefined) node.const = pResolved.const;
                    
                    if (pResolved.discriminator || pResolved.oneOf || (pResolved.type === 'object' && pResolved.properties)) {
                        node.properties = parseSchema(pResolved, fullName + '__');
                    } else if (pResolved.type === 'array' && pResolved.items) {
                        let itemsRes = resolve(pResolved.items);
                        if (itemsRes.properties || itemsRes.discriminator || itemsRes.oneOf) {
                            node.items = parseSchema(itemsRes, fullName + '_items__');
                        }
                    }

                    nodes.push(node);
                });
            }

            return nodes;
        }

        let rootFields = parseSchema(schema);
        let globalConnections = getConnectionsFor(null);

        return [...globalConnections, ...rootFields];
    }

    function updateMetadataDisplay(skipFields) {
        const meta = window.TOOL_META || {};
        console.log('window.TOOL_METAwindow.TOOL_METAwindow.TOOL_META', window.TOOL_META)

        const schema = window.TOOL_SCHEMA || {};
        const displayProps = generateDisplayProperties(schema, skipFields, meta);

        const hasMultiOp = !!(schema.properties && Object.values(schema.properties).some(p => {
            let res = p;
            if (p.$ref) res = resolveDef(p.$ref, schema.$defs || schema.definitions || {}) || p;
            return res.discriminator || res.oneOf;
        }));

        const exportObj = {
            "name": window.TOOL_NAME,
            "type": "tool",
            "title": meta.display_name || window.TOOL_NAME,
            "description": window.TOOL_DESCRIPTION || "",
            "properties": schema,
            "display_description": window.TOOL_DESCRIPTION || "",
            "display_properties": displayProps,
            "connection_string": meta.connection_name
                ? {
                    "type": "connection", "value": Array.isArray(meta.connection_name)
                        ? meta.connection_name.map(c => c.type).join(', ')
                        : (meta.connection_name.type || meta.category || "Service")
                }
                : null,
            "category_name": meta.category || "Uncategorized",
            "server": "Caregence-MCP-Server",
            "server_url": window.SSE_URL || "",
            "icon": meta.icon || "box",
            "output_schema": null,
            "hidden_property": skipFields.join(','),
            "has_multi_operation": hasMultiOp
        };

        const pre = document.getElementById('metadata-json');
        if (pre) {
            pre.textContent = JSON.stringify(exportObj, null, 2);
        }
    }

    const copyBtn = document.getElementById('copy-metadata-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const json = document.getElementById('metadata-json').textContent;
            navigator.clipboard.writeText(json).then(() => {
                const orig = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i data-lucide="check" style="width:16px; height:16px;"></i> <span>Copied!</span>';
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    copyBtn.innerHTML = orig;
                    if (window.lucide) lucide.createIcons();
                }, 20000);
            });
        });
    }

    const rawMetaPre = document.getElementById('raw-meta-json');
    if (rawMetaPre) {
        rawMetaPre.textContent = JSON.stringify(window.TOOL_META || {}, null, 2);
    }

    const copyRawMetaBtn = document.getElementById('copy-raw-meta-btn');
    if (copyRawMetaBtn) {
        copyRawMetaBtn.addEventListener('click', () => {
            const json = document.getElementById('raw-meta-json').textContent;
            navigator.clipboard.writeText(json).then(() => {
                const orig = copyRawMetaBtn.innerHTML;
                copyRawMetaBtn.innerHTML = '<i data-lucide="check" style="width:16px; height:16px;"></i> <span>Copied!</span>';
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    copyRawMetaBtn.innerHTML = orig;
                    if (window.lucide) lucide.createIcons();
                }, 20000);
            });
        });
    }

    // ─── Dynamic Dependencies ───────────────────────────────────────────────────
    function setupDependencies() {
        const meta = window.TOOL_META || {};
        if (!meta.dependencies || !Array.isArray(meta.dependencies)) {
            console.log("[Dependencies] No meta.dependencies found for this tool.");
            return;
        }

        console.log("[Dependencies] Setting up dependencies:", meta.dependencies);

        // Use event delegation to handle dynamically rendered fields
        root.addEventListener('change', async (e) => {
            if (!e.target || !e.target.name) return;
            const targetName = e.target.name;

            // Helper to check if a field name matches the desired target
            const isMatch = (name, target) => {
                return name === target || name.endsWith('__' + target) || name.endsWith('.' + target);
            };

            for (const dep of meta.dependencies) {
                const on_change = dep.on_change || [];
                const on_value = dep.on_value;
                const action = dep.action;
                const dependent_value = dep.dependent_value;

                if (!on_value || !action) continue;

                const triggered = on_change.some(triggerName => isMatch(targetName, triggerName));
                if (triggered) {
                    console.log(`[Dependencies] Triggered by field '${targetName}' matching '${dep.on_change}'`);
                    
                    // Find active connection ID
                    const connSelects = Array.from(document.querySelectorAll('select[name^="Credential"], select[name="connection_id"]'));
                    const activeConnSelect = connSelects.find(s => s.offsetParent !== null && s.value);
                    const connection_id = activeConnSelect ? activeConnSelect.value : null;

                    if (!connection_id) {
                        console.warn("[Dependencies] No active connection_id found for action:", action);
                    } else {
                        console.log(`[Dependencies] Found connection_id: ${connection_id}`);
                    }

                    // If dependent_value specified, clear it
                    if (dependent_value) {
                        const allInputs = Array.from(root.querySelectorAll('input, select, textarea'));
                        const depElements = allInputs.filter(el => isMatch(el.name, dependent_value));
                        depElements.forEach(el => {
                            if (el.tagName === 'SELECT') {
                                el.innerHTML = `<option value="">Select ${dependent_value}...</option>`;
                            } else {
                                el.value = '';
                            }
                        });
                    }

                    // Prepare target elements
                    const allInputs = Array.from(root.querySelectorAll('input, select, textarea'));
                    const targetElements = allInputs.filter(el => isMatch(el.name, on_value));
                    
                    targetElements.forEach(el => {
                        if (el.tagName === 'SELECT') {
                            el.innerHTML = `<option value="">Loading options...</option>`;
                        } else {
                            // Replace input with select
                            const sel = document.createElement('select');
                            sel.id = el.id;
                            sel.name = el.name;
                            sel.className = el.className;
                            sel.required = el.required;
                            sel.innerHTML = `<option value="">Loading options...</option>`;
                            el.parentNode.replaceChild(sel, el);
                        }
                    });

                    const triggerKey = targetName.split('__').pop();
                    const payload = {
                        connection_id: connection_id,
                        action: action,
                        params: {
                            [triggerKey]: e.target.value
                        }
                    };
                    
                    console.log("[Dependencies] Sending action payload:", payload);

                    try {
                        const response = await fetch('/api/connection-actions/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        
                        if (!response.ok) throw new Error(`HTTP ${response.status} - Failed to execute connection action`);
                        
                        const resData = await response.json();
                        console.log("[Dependencies] Received proxy response:", resData);
                        let optionsList = [];
                        if (resData.data && resData.data.result) {
                            // Find the first array in the result object (e.g. 'teams' or 'channels')
                            for (const key in resData.data.result) {
                                if (Array.isArray(resData.data.result[key])) {
                                    optionsList = resData.data.result[key];
                                    break;
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

                        // Re-fetch target elements in case they were replaced
                        const latestInputs = Array.from(root.querySelectorAll('input, select, textarea'));
                        const updatedTargetElements = latestInputs.filter(el => isMatch(el.name, on_value));
                        
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
                        
                        console.log(`[Dependencies] Successfully updated field '${on_value}' with ${optionsList.length} options.`);
                    } catch (err) {
                        console.error("[Dependencies] Action Execution Error:", err);
                        const latestInputs = Array.from(root.querySelectorAll('input, select, textarea'));
                        const updatedTargetElements = latestInputs.filter(el => isMatch(el.name, on_value));
                        updatedTargetElements.forEach(el => {
                            el.innerHTML = `<option value="">Error loading options</option>`;
                        });
                    }
                }
            }
        });
    }

    // ─── Boot ───────────────────────────────────────────────────────────────────
    renderForm(schema);
    setupDependencies();
});
