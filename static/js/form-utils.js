function slugify(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function connectionMatchesSchemaContext(c, chosen, def, namePrefix = '') {
    if (!c || !c.dependency || !chosen) return false;
    if (slugify(c.dependency) !== slugify(chosen)) return false;

    const cleanSubDep = slugify(c.sub_dependency || '');
    const cleanType = slugify(c.type || '');

    const cleanPrefix = slugify(namePrefix || '');
    console.log("cleanPrefix:", cleanPrefix)

    // Context filter based on property parent name
    // if (cleanPrefix) {
    //     if (cleanPrefix.includes('llm')) {
    //         const isLLM = cleanSubDep.includes('credential') || cleanSubDep.includes('openai') || cleanSubDep.includes('bedrock') ||
    //                       cleanType.includes('openai') || cleanType.includes('bedrock') || cleanType.includes('llm');
    //         if (!isLLM) return false;
    //     } else if (cleanPrefix.includes('source') || cleanPrefix.includes('operations')) {
    //         const isStorageOrOperations = cleanSubDep.includes('config') || cleanSubDep.includes('storage') || cleanSubDep.includes('s3') || cleanSubDep.includes('blob') ||
    //                                       cleanType.includes('storage') || cleanType.includes('s3') || cleanType.includes('email') || cleanType.includes('cloud');
    //         if (!isStorageOrOperations) return false;
    //     }
    // }

    if (cleanPrefix) {
        if (cleanPrefix.includes('llm')) {
            const isLLM = cleanSubDep.includes('credential') || cleanSubDep.includes('openai') || cleanSubDep.includes('bedrock') ||
                cleanType.includes('openai') || cleanType.includes('bedrock') || cleanType.includes('llm');
            if (!isLLM) return false;
        } else if (cleanPrefix.includes('source') || cleanPrefix.includes('operations')) {
            const isStorageOrOperations = cleanSubDep.includes('config') || cleanSubDep.includes('storage') || cleanSubDep.includes('s3') || cleanSubDep.includes('blob') ||
                cleanType.includes('storage') || cleanType.includes('s3') || cleanType.includes('email') || cleanType.includes('cloud') ||
                cleanType.includes('postgres') || cleanType.includes('mysql') || cleanType.includes('snowflake') || cleanType.includes('databricks') ||
                cleanType.includes('db') || cleanType.includes('database') || cleanType.includes('sql');
            if (!isStorageOrOperations) return false;
        }
    }

    if (!c.sub_dependency) return true;

    const cleanTitle = slugify((def && def.title) || '');
    if (cleanSubDep === cleanTitle || (cleanTitle && (cleanTitle.includes(cleanSubDep) || cleanSubDep.includes(cleanTitle)))) {
        return true;
    }

    // Check property fields overlap
    if (def && def.properties) {
        const propKeys = Object.keys(def.properties).map(k => slugify(k));
        const serviceSpecificFields = ['bucket', 'key', 'container', 'blob', 'azure_openai_endpoint', 'aws_access_key_id'];
        const connFields = (c.fields || []).map(f => slugify(f));

        const allMatch = connFields.every(f => propKeys.includes(f));
        if (allMatch) return true;

        const hasSpecificMatch = connFields.some(f => serviceSpecificFields.includes(f) && propKeys.includes(f));
        if (hasSpecificMatch) return true;
    }

    return false;
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

function detectDiscriminator(oneOfSchema, defs) {
    console.log("[MCP Form] detectDiscriminator called with schema:", oneOfSchema);
    if (!oneOfSchema || !oneOfSchema.oneOf) {
        console.log("[MCP Form] schema has no oneOf, returning default 'type'");
        return "type";
    }
    const firstSub = oneOfSchema.oneOf[0];
    if (firstSub) {
        let resolved = firstSub;
        if (firstSub.$ref) {
            resolved = resolveDef(firstSub.$ref, defs) || firstSub;
            console.log("[MCP Form] resolved $ref to:", resolved);
        }
        if (resolved && resolved.properties) {
            for (const propName of Object.keys(resolved.properties)) {
                const propVal = resolved.properties[propName];
                if (propVal && (propVal.const !== undefined || propVal.enum !== undefined)) {
                    console.log("[MCP Form] detected discriminator property:", propName);
                    return propName;
                }
            }
        }
    }
    console.log("[MCP Form] no discriminator property detected, returning default 'type'");
    return "type";
}

function normalizeFieldName(name) {
    return slugify(name).replace(/[._]+/g, '_');
}

function fieldsMatch(name1, name2) {
    const n1 = normalizeFieldName(name1);
    const n2 = normalizeFieldName(name2);
    return n1 === n2 || n1.endsWith('_' + n2);
}

function schemaMatchesConnection(resolvedSchema, connection) {
    if (!resolvedSchema || !resolvedSchema.properties) return false;
    const props = Object.keys(resolvedSchema.properties).map(p => slugify(p));
    const connFields = connection.fields.map(f => slugify(f));
    return connFields.every(cf => props.includes(cf));
}

// const ALWAYS_SHOW_FIELDS = new Set([
//     'access_key',
//     'secret_key',
//     'region',
//     'region_name',
//     'aws_sender'
// ]);

const ALWAYS_SHOW_FIELDS = new Set([]);

function isCredentialField(fieldName) {
    if (!fieldName) return false;
    const slug = slugify(fieldName);

    // Explicitly ignore workflow tracking IDs
    if (slug === 'workflow_id' || slug === 'execution_id') return false;

    const CREDENTIAL_KEYWORDS = [];
    return CREDENTIAL_KEYWORDS.some(kw => slug.includes(kw)) ||
        // slug.endsWith('_id') ||
        // slug.endsWith('_key') ||
        slug.endsWith('_token') ||
        slug.endsWith('_secret') ||
        slug.endsWith('_password');
}

function inferConnectionType(fields, fallback) {
    const availableConns = window.CAREGENCE_CONNECTIONS || [];

    for (const f of fields) {
        const parts = f.split('_');
        if (parts.length > 1) {
            const prefix = parts[0].toLowerCase();

            // Check if prefix matches any connection type in CAREGENCE_CONNECTIONS
            const match = availableConns.find(c => (c.connection_type || '').toLowerCase() === prefix);
            if (match) return match.connection_type;

            // Special handling for compound names like azure_openai -> Azure_OpenAI or aws_bedrock -> AWS_Bedrock
            const matchCompound = availableConns.find(c => {
                const cTypeLower = (c.connection_type || '').toLowerCase();
                return cTypeLower.startsWith(prefix) || prefix.startsWith(cTypeLower);
            });
            if (matchCompound) return matchCompound.connection_type;
        }
    }
    return fallback;
}

function autoDiscoverConnections(schemaObj) {
    const defs = schemaObj.$defs ||
        schemaObj.definitions ||
        (schemaObj.properties && (schemaObj.properties.$defs || schemaObj.properties.definitions)) ||
        {};
    const connections = [];

    function scanSchema(s, opValue = null) {
        if (!s) return;

        let resolved = s;
        if (s.$ref) {
            resolved = resolveDef(s.$ref, defs) || s;
        }

        if (resolved.anyOf) {
            resolved.anyOf.forEach(sub => scanSchema(sub, opValue));
        }

        if (resolved.properties) {
            // Check if this object contains credential fields
            const credentialFields = Object.keys(resolved.properties).filter(f => isCredentialField(f));
            if (credentialFields.length >= 2) {
                let connType = inferConnectionType(credentialFields, resolved.title || 'Service');
                const connTypeLower = connType.toLowerCase();
                if (connTypeLower.includes('azure')) {
                    connType = 'Azure_OpenAI';
                } else if (connTypeLower.includes('aws') || connTypeLower.includes('bedrock') || connTypeLower.includes('s3')) {
                    connType = 'AWS_Bedrock';
                }

                const exists = connections.some(c => c.type === connType && c.dependency === opValue);
                if (!exists) {
                    connections.push({
                        dependency: opValue,
                        fields: credentialFields,
                        type: connType
                    });
                }
            }

            Object.values(resolved.properties).forEach(prop => scanSchema(prop, opValue));
        }

        if (resolved.discriminator || resolved.oneOf) {
            const discriminator = resolved.discriminator || { propertyName: detectDiscriminator(resolved, defs) };
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
                        if (discField.const !== undefined && discField.const !== null) {
                            mapping[discField.const] = sub;
                        } else if (discField.enum && Array.isArray(discField.enum)) {
                            discField.enum.forEach(val => {
                                if (val !== undefined && val !== null) {
                                    mapping[val] = sub;
                                }
                            });
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
                    const fields = Object.keys(subSchema.properties).filter(f => f !== propName && isCredentialField(f));
                    if (fields.length >= 2) {
                        let connType = inferConnectionType(fields, dependencyVal.charAt(0).toUpperCase() + dependencyVal.slice(1));
                        const connTypeLower = connType.toLowerCase();
                        // if (connTypeLower.includes('azure')) {
                        //     connType = 'Azure_OpenAI';
                        // } else if (connTypeLower.includes('aws') || connTypeLower.includes('bedrock') || connTypeLower.includes('s3')) {
                        //     connType = 'AWS_Bedrock';
                        // }

                        const exists = connections.some(c => c.dependency === dependencyVal && c.type === connType);
                        if (!exists) {
                            connections.push({
                                dependency: dependencyVal,
                                fields: fields,
                                type: connType
                            });
                        }
                    }
                }
                scanSchema(mappingVal, dependencyVal);
            });
        }
    }

    scanSchema(schemaObj);
    return connections;
}

function initializeConnectionsMeta(schema) {
    if (!window.TOOL_META) window.TOOL_META = {};

    // If the tool already provides specific connections, respect them and skip auto-discovery
    if (window.TOOL_META.connection_name &&
        (Array.isArray(window.TOOL_META.connection_name) ? window.TOOL_META.connection_name.length > 0 : true)) {
        if (!Array.isArray(window.TOOL_META.connection_name)) {
            window.TOOL_META.connection_name = [window.TOOL_META.connection_name];
        }
        return;
    }

    window.TOOL_META.connection_name = [];
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
    const fieldNames = [name, fullId, dotId].filter(Boolean);

    if (meta.connection_name) {
        const rawConns = Array.isArray(meta.connection_name) ? meta.connection_name : [meta.connection_name];
        const connectionFields = [];
        rawConns.forEach(c => {
            const rawFields = c.fields || Object.keys(c).filter(k => k !== 'type' && k !== 'fields' && k !== 'dependency' && k !== 'sub_dependency');
            const fields = Array.isArray(rawFields) ? rawFields : String(rawFields).split(',').map(s => s.trim()).filter(Boolean);
            fields.forEach(f => connectionFields.push(f));
        });

        const isMappedToConnection = fieldNames.some(fn =>
            connectionFields.some(cf => fieldsMatch(fn, cf))
        );
        if (isMappedToConnection) {
            return false;
        }
    }

    return fieldNames.some(f =>
        Array.from(ALWAYS_SHOW_FIELDS).some(always => fieldsMatch(f, always))
    );
}

function generateDisplayProperties(schema, skipFields, meta) {
    const defs = schema.$defs ||
        schema.definitions ||
        (schema.properties && (schema.properties.$defs || schema.properties.definitions)) ||
        {};

    function resolve(s) {
        return s.$ref ? (resolveDef(s.$ref, defs) || s) : s;
    }

    function shouldSkip(name, fullName) {
        if (isAlwaysShow(name, fullName)) return false;
        return skipFields.some(sf => fieldsMatch(name, sf) || fieldsMatch(fullName, sf));
    }

    function getConnectionsFor(opValue = null, resolvedSchema = null, namePrefix = '') {
        if (!meta || !meta.connection_name) return [];
        const conns = Array.isArray(meta.connection_name) ? meta.connection_name : [meta.connection_name];
        let nodes = [];

        conns.forEach((c, idx) => {
            let shouldInclude = false;
            if (opValue === null) {
                shouldInclude = !c.dependency;
            } else {
                shouldInclude = connectionMatchesSchemaContext(c, opValue, resolvedSchema, namePrefix);
            }

            if (shouldInclude) {
                const connType = c.type || meta.category || 'Service';
                const displayConnType = Array.isArray(connType) ? connType.join(', ') : connType;
                const propName = conns.length > 1 ? `Credential_${(c.type || idx).toString().replace(/\s+/g, '_')}` : "Credential";

                nodes.push({
                    "type": ["connection"],
                    "title": `Select ${displayConnType} Connection`,
                    "required": true,
                    "description": `Choose a ${displayConnType} connection.`,
                    "propertyName": propName,
                    "connection_value": connType
                });
            }
        });
        return nodes;
    }

    function parseSchema(currentSchema, prefix = '', skipProp = null, parentPath = '', parentRequired = false) {
        console.log("currentSchema:", currentSchema)
        if (!currentSchema) return [];
        let resolved = resolve(currentSchema);
        console.log("resolved:", resolved)

        let nodes = [];

        if (resolved.discriminator) {

            const propName = resolved.discriminator.propertyName;
            console.log("resolved.discriminator:", resolved.discriminator)
            console.log("propName:", propName)
            console.log("resolved.display_title:", resolved.display_title)

            let mapping = resolved.discriminator.mapping || {};

            if (Object.keys(mapping).length === 0 && resolved.oneOf) {
                resolved.oneOf.forEach(sub => {
                    let subRes = resolve(sub);
                    const discField = subRes.properties?.[propName];
                    if (discField) {
                        if (discField.const !== undefined && discField.const !== null) {
                            mapping[discField.const] = sub;
                        } else if (discField.enum && Array.isArray(discField.enum)) {
                            discField.enum.forEach(val => {
                                if (val !== undefined && val !== null) {
                                    mapping[val] = sub;
                                }
                            });
                        }
                    }
                });
            }

            let discNode = {
                name: propName,
                propertyName: prefix + propName,
                type: ['string'],
                title: resolved.display_title || propName,
                required: parentPath === '' ? true : parentRequired,
                enum: Object.keys(mapping),
                isDiscriminator: true,
                mapping: {}
            };

            Object.entries(mapping).forEach(([val, refSchema]) => {
                const schemaToParse = typeof refSchema === 'string' ? { $ref: refSchema } : refSchema;
                const resolvedSchema = resolve(schemaToParse);
                let childNodes = parseSchema(schemaToParse, prefix, propName, parentPath ? parentPath + '.' + propName : propName, parentRequired);
                let contextualConns = getConnectionsFor(val, resolvedSchema, parentPath ? parentPath + '.' + propName : propName);
                discNode.mapping[val] = [...contextualConns, ...childNodes];
            });

            nodes.push(discNode);
            return nodes;
        }

        if (resolved.properties) {
            const reqList = resolved.required || [];
            Object.entries(resolved.properties).forEach(([name, propSchema]) => {
                console.log("propSchema:", propSchema)
                if (name === skipProp) return;

                const fullName = prefix ? `${prefix}${name}` : name;
                if (shouldSkip(name, fullName)) return;

                let pResolved = resolve(propSchema);
                console.log("pResolved:", pResolved)

                // Connection checking at this level is handled globally via dependencies above.

                const origTitle = pResolved.display_title;
                const origDesc = pResolved.description;
                const origDefault = pResolved.default;

                if (pResolved.anyOf) {
                    const nonNull = pResolved.anyOf.find(s => s.type !== 'null');
                    if (nonNull) {
                        pResolved = resolve(nonNull);
                    }
                }

                if (!pResolved.discriminator && pResolved.oneOf) {
                    pResolved.discriminator = { propertyName: detectDiscriminator(pResolved, defs) };
                }

                let type = Array.isArray(pResolved.type) ? pResolved.type : (pResolved.type ? [pResolved.type] : ['string']);
                const fieldMetaType = meta && meta.fields && meta.fields[name] && meta.fields[name].type;
                if (fieldMetaType) type = [fieldMetaType];
                console.log("node 2 :", pResolved.display_title)
                console.log("node 3 :", origTitle)
                console.log("node 4 :", pResolved.title)
                console.log("node 5 :", name)

                let node = {
                    name: name,
                    propertyName: fullName,
                    type: type,
                    title: pResolved.display_title || origTitle || pResolved.title || name,
                    required: reqList.includes(name),
                    description: origDesc || pResolved.description || '',
                };
                console.log("node:", node)

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
                const metaField = meta && meta.fields && meta.fields[name];
                const inputOptions = pResolved.input_options || propSchema.input_options || (metaField && metaField.input_options);
                if (inputOptions !== undefined) node.input_options = inputOptions;

                if (pResolved.discriminator || pResolved.oneOf || (pResolved.type === 'object' && pResolved.properties)) {
                    node.properties = parseSchema(pResolved, '', null, parentPath ? parentPath + '.' + name : name, reqList.includes(name));
                } else if (pResolved.type === 'array' && pResolved.items) {
                    let itemsRes = resolve(pResolved.items);
                    if (itemsRes.properties || itemsRes.discriminator || itemsRes.oneOf) {
                        node.items = parseSchema(itemsRes, '', null, parentPath ? parentPath + '.' + name : name, true);
                    }
                }

                nodes.push(node);
            });
        }

        return nodes;
    }

    let rootFields = parseSchema(schema, '', null, '');
    let globalConnections = getConnectionsFor(null);

    return [...globalConnections, ...rootFields];
}

function updateMetadataDisplay(skipFields) {
    const meta = window.TOOL_META || {};
    const schema = window.TOOL_SCHEMA || {};
    console.log("schema:", schema)
    const displayProps = generateDisplayProperties(schema, skipFields, meta);
    console.log("displayProps:", displayProps)

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

    console.log("exportObj:", exportObj)

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
                }, 2000);
            });
        });
    }

    const rawMetaPre = document.getElementById('raw-meta-json');
    if (rawMetaPre) {
        rawMetaPre.textContent = JSON.stringify(window.RAW_TOOL_META || {}, null, 2);
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
                }, 2000);
            });
        });
    }
}
