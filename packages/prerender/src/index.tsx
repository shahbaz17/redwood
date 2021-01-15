import fs from 'fs'

import React from 'react'

import prettier from 'prettier'
import ReactDOMServer from 'react-dom/server'

import { getConfig, getPaths } from '@redwoodjs/internal'

// @TODO do we need to use path.join?
const INDEX_FILE = `${getPaths().web.dist}/index.html`
const DEFAULT_INDEX = `${getPaths().web.dist}/defaultIndex.html`

const getRootHtmlPath = () => {
  if (fs.existsSync(DEFAULT_INDEX)) {
    return DEFAULT_INDEX
  } else {
    return INDEX_FILE
  }
}

interface PrerenderParams {
  inputComponentPath: string // usually web/src/{components/pages}/*
  outputHtmlPath: string // web/dist/{path}.html
  dryRun: boolean
}

// This will prevent SSR blowing up,
// without needing us to change every bit of code
// WARN! is a stop-gap solution
const registerShims = () => {
  if (!globalThis.window) {
    globalThis.window = {
      // @ts-expect-error-next-line
      location: {
        pathname: '',
        search: '',
      },
      // @ts-expect-error-next-line
      history: {},
      __REDWOOD_PRERENDER_MODE: true,
    }
  }

  // @ts-expect-error-next-line
  globalThis.__REDWOOD__API_PROXY_PATH = getConfig().web.apiProxyPath
  // @ts-expect-error-next-line
  globalThis.__REDWOOD__USE_AUTH = () => ({
    loading: true, // This should 🤞🏽 just cause the whileLoading component to show up on Private routes
    isAuthenticated: false,
  })

  // globalThis.prerenderMode = true
}

export const runPrerender = async ({
  inputComponentPath,
  outputHtmlPath,
  dryRun,
}: PrerenderParams) => {
  registerShims()

  const indexContent = fs.readFileSync(getRootHtmlPath()).toString()

  const { default: ComponentToPrerender } = await import(inputComponentPath)
  const { default: Routes } = await import(getPaths().web.routes)

  const componentAsHtml = ReactDOMServer.renderToStaticMarkup(
    <>
      {/* Do this so that the @redwoodjs/router.routes object is populated */}
      <Routes />
      <ComponentToPrerender />
    </>
  )

  const renderOutput = indexContent.replace('<server-markup/>', componentAsHtml)

  if (dryRun) {
    console.log('::: Dry run, not writing changes :::')
    console.log(`::: 🚀 Prerender output for ${inputComponentPath} ::: `)
    const prettyOutput = prettier.format(renderOutput, { parser: 'html' })
    console.log(prettyOutput)
    console.log('::: --- ::: ')

    return
  }

  if (outputHtmlPath) {
    // Copy default index.html to defaultIndex.html first, like react-snap
    if (outputHtmlPath === 'web/dist/index.html') {
      fs.copyFileSync(outputHtmlPath, 'web/dist/defaultIndex.html')
    }
    fs.writeFileSync(outputHtmlPath, renderOutput)
  }
}