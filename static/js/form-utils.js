function slugify(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function resolveDef(ref, defs) {
    if (!ref || !defs) return null;
    const key = ref.split('/').pop();
    if (defs[key]) return defs[key];
    
    // Case-insensitive fallback
    const keyLower = key.toLowerCase();
    const foundKey = Object.keys(defs).find(k => k.toLowerCase() === keyLower);
    if (foundKey) return defs[foundKey];
    
    return null;
}

const ALWAYS_SHOW_FIELDS = new Set([
    'access_key',
    'secret_key',
    'region',
    'region_name',
    'aws_sender'
]);

function autoDiscoverConnections(schemaObj) {
    const defs = schemaObj.$defs || schemaObj.definitions || {};
    const connections = [];

    function scanSchema(s) {
        if (!s) return;
        
        let resolved = s;
        if (s.$ref) {
            resolved = resolveDef(s.$ref, defs) || s;
        }

        if (resolved.anyOf) {
            resolved.anyOf.forEach(sub => scanSchema(sub));
        }

        if (resolved.properties) {
            Object.values(resolved.properties).forEach(prop => scanSchema(prop));
        }

        if (resolved.discriminator || resolved.oneOf) {
            const discriminator = resolved.discriminator || { propertyName: "type" };
            const propName = discriminator.propertyName;
            let mapping = discriminator.mapping || {};

            if (Object.keys(mapping).length === 0 && resolved.oneOf) {
                resolved.oneOf.forEach(sub => {
                    let subRes = sub;
                    if (sub.$ref) {
                        subRes = resolveDef(sub.$ref, defs) || sub;
                    }
                    const discField = subRes.properties?.[propName];
                    if (discField) {
                        let discValue = discField.const || (discField.enum && discField.enum[0]);
                        if (discValue) {
                            mapping[discValue] = sub;
                        }
                    }
                });
            }

            Object.entries(mapping).forEach(([dependencyVal, mappingVal]) => {
                let subSchema = typeof mappingVal === 'string' ? resolveDef(mappingVal, defs) : mappingVal;
                if (subSchema && subSchema.$ref) {
                    subSchema = resolveDef(subSchema.$ref, defs);
                }
                if (subSchema && subSchema.properties) {
                    const fields = Object.keys(subSchema.properties).filter(f => f !== propName);
                    
                    let connType = 'Service';
                    const depLower = dependencyVal.toLowerCase();
                    if (depLower.includes('azure')) {
                        connType = 'Azure_OpenAI';
                    } else if (depLower.includes('aws') || depLower.includes('bedrock')) {
                        connType = 'AWS_Bedrock';
                    } else if (depLower.includes('twilio')) {
                        connType = 'Twilio';
                    } else if (depLower.includes('slack')) {
                        connType = 'Slack';
                    } else {
                        connType = dependencyVal.charAt(0).toUpperCase() + dependencyVal.slice(1);
                    }

                    const exists = connections.some(c => c.dependency === dependencyVal && c.type === connType);
                    if (!exists && fields.length > 0) {
                        connections.push({
                            dependency: dependencyVal,
                            fields: fields,
                            type: connType
                        });
                    }
                }
            });
        }
    }

    scanSchema(schemaObj);
    return connections;
}

function initializeConnectionsMeta(schema) {
    if (!window.TOOL_META) window.TOOL_META = {};
    if (!window.TOOL_META.connection_name) {
        window.TOOL_META.connection_name = [];
    }
    if (!Array.isArray(window.TOOL_META.connection_name)) {
        window.TOOL_META.connection_name = [window.TOOL_META.connection_name];
    }

    const discoveredConnections = autoDiscoverConnections(schema);
    discoveredConnections.forEach(d => {
        const exists = window.TOOL_META.connection_name.some(c => 
            c.dependency === d.dependency || 
            (c.type && c.type.toLowerCase() === d.type.toLowerCase())
        );
        if (!exists) {
            window.TOOL_META.connection_name.push(d);
        }
    });
}

function isAlwaysShow(name, fullId = '', dotId = '') {
    const meta = window.TOOL_META || {};
    if (meta.connection_name) {
        const rawConns = Array.isArray(meta.connection_name) ? meta.connection_name : [meta.connection_name];
        const connectionFields = [];
        rawConns.forEach(c => {
            const rawFields = c.fields || Object.keys(c).filter(k => k !== 'type' && k !== 'fields' && k !== 'dependency');
            const fields = Array.isArray(rawFields) ? rawFields : String(rawFields).split(',').map(s => s.trim()).filter(Boolean);
            fields.forEach(f => connectionFields.push(slugify(f)));
        });
        
        const fieldNames = [name, fullId, dotId].filter(Boolean).map(f => slugify(f));
        const isMappedToConnection = fieldNames.some(fn => 
            connectionFields.some(cf => fn === cf || fn.endsWith('_' + cf) || fn.endsWith('.' + cf))
        );
        if (isMappedToConnection) {
            return false;
        }
    }

    const fields = [name, fullId, dotId].filter(Boolean);
    return fields.some(f => {
        const slug = slugify(f);
        return Array.from(ALWAYS_SHOW_FIELDS).some(always => 
            slug === always || 
            slug.endsWith('_' + always) || 
            slug.endsWith('.' + always)
        );
    });
}

function generateDisplayProperties(schema, skipFields, meta) {
    const defs = schema.$defs || schema.definitions || {};

    function resolve(s) {
        return s.$ref ? (resolveDef(s.$ref, defs) || s) : s;
    }

    function shouldSkip(name, fullName) {
        if (isAlwaysShow(name, fullName)) return false;
        const nSlug = slugify(name);
        const fSlug = slugify(fullName);
        const dotSlug = slugify(fullName.replace(/__/g, '.'));
        return skipFields.some(sf => {
            const sfSlug = slugify(sf);
            return sfSlug === nSlug ||
                sfSlug === fSlug ||
                sfSlug === dotSlug ||
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
                const origTitle = pResolved.title;
                const origDesc = pResolved.description;
                const origDefault = pResolved.default;

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
                    title: origTitle || pResolved.title || name,
                    required: reqList.includes(name),
                    description: origDesc || pResolved.description || '',
                };

                if (meta && meta.dependencies && meta.dependencies.length > 0) {
                    const fieldDeps = meta.dependencies.filter(d =>
                        d.on_value === name ||
                        (d.on_change && d.on_change.includes(name))
                    );
                    if (fieldDeps.length > 0) {
                        node.dependencies = fieldDeps;
                    }
                }
                if (pResolved.enum) node.enum = pResolved.enum;
                if (origDefault !== undefined) node.default = origDefault;
                else if (pResolved.default !== undefined) node.default = pResolved.default;
                if (pResolved.const !== undefined) node.const = pResolved.const;

                if (pResolved.discriminator || pResolved.oneOf || (pResolved.type === 'object' && pResolved.properties)) {
                    node.properties = parseSchema(pResolved, '');
                } else if (pResolved.type === 'array' && pResolved.items) {
                    let itemsRes = resolve(pResolved.items);
                    if (itemsRes.properties || itemsRes.discriminator || itemsRes.oneOf) {
                        node.items = parseSchema(itemsRes, '');
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

    if (meta.dependencies && meta.dependencies.length > 0) {
        exportObj.dependencies = meta.dependencies;
    }

    const pre = document.getElementById('metadata-json');
    if (pre) {
        pre.textContent = JSON.stringify(exportObj, null, 2);
    }
}

function setupMetadataUI() {
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
}
