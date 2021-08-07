require("es6-promise").polyfill()
require("isomorphic-fetch")

exports.sourceNodes = async (
  {
    actions,
    store,
    cache,
    createNodeId,
    createContentDigest,
    getCache,
    getNode,
    getNodes,
    parentSpan,
    reporter,
    webhookBody,
  },
  pluginOptions
) => {
  const {
    baseUrl,
    apiBase = "jsonapi",
    basicAuth = {},
    headers = {},
    menus,
    languages = ["und"],
  } = pluginOptions
  const { createNode, createParentChildLink } = actions

  reporter.info(`Starting to fetch menu link items from Drupal`)
  reporter.info("Menus to fetch are " + menus.join(", "))
  reporter.info("Menu languages to fetch are " + languages.join(", "))

  if (basicAuth.username) {
    headers.Authorization = `Basic ${Buffer.from(
      `${basicAuth.username}:${basicAuth.password}`,
      "utf-8"
    ).toString("base64")}`
  }

  // Data can come from anywhere, but for now create it manually
  const menuResponses = await Promise.all(
    menus.map(async (menu) => {
      return Promise.all(
        languages.map(async (langcode) => {
          const langPrefix = langcode !== "und" ? `/${langcode}` : ""
          const result = await fetch(
            `${baseUrl}/${langPrefix}${apiBase}/menu_items/${menu}`,
            {
              headers,
            }
          ).then(function (response) {
            if (response.status >= 400) {
              reporter.error(
                `Bad response from ${baseUrl}/${apiBase}/menu_items/${menu}`
              )
            }
            return response.json()
          })
          result.langcode = langcode
          return result
        })
      )
    })
  )
  menuResponses.forEach((menuResponse) => {
    menuResponse.forEach(({ data: menuItems, langcode }) => {
      const langSuffix = langcode !== "und" ? `-${langcode}` : ""
      const map = new Map()
      menuItems.forEach((item) => {
        const nodeContent = JSON.stringify(item)
        const id = `menu-items-${item.id}${langSuffix}`
        let parentId = null
        if (item.attributes.parent) {
          parentId = `menu-items-${item.attributes.parent}${langSuffix}`
        }
        const nodeMeta = {
          id,
          parent: parentId,
          children: [],
          langcode,
          internal: {
            type: `MenuItems`,
            mediaType: `text/html`,
            content: nodeContent,
            contentDigest: createContentDigest(item),
          },
        }
        const node = Object.assign({}, item.attributes, nodeMeta)
        createNode(node)
        if (parentId && map.has(parentId)) {
          createParentChildLink({ parent: map.get(parentId), child: node })
        }
        map.set(id, node)
      })
    })
  })
}
