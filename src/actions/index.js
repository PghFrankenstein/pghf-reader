import fetch from 'isomorphic-fetch'

export const REQUEST_RESOURCE = 'REQUEST_RESOURCE'
export const RECEIVE_RESOURCE = 'RECEIVE_RESOURCE'
export const GET_COLLATION_SOURCES = 'GET_COLLATION_SOURCES'
export const SET_VARIANTS = 'SET_VARIANTS'

const parser = new window.DOMParser()
const serializer = new window.XMLSerializer()

function uuid() {
  let value = ''
  let i
  let random
  for (i = 0; i < 32; i++) {
    random = Math.random() * 16 | 0

    if (i === 8 || i === 12 || i === 16 || i === 20) {
      value += '-'
    }
    value += (i === 12 ? 4 : (i === 16 ? (random & 3 | 8) : random)).toString(16)
  }
  return value
}

function requestResource(url, docType) {
  return {
    type: REQUEST_RESOURCE,
    url,
    docType
  }
}

function receiveResource(data, docType) {
  return {
    type: RECEIVE_RESOURCE,
    data,
    receivedAt: Date.now(),
    docType
  }
}

function getCollationSources() {
  return {
    type: GET_COLLATION_SOURCES,
  }
}

export function setVariants(variants) {
  return {
    type: SET_VARIANTS,
    variants
  }
}

/** ********
 * thunks *
 ******** **/

export function getResource(url, docType) {
  return dispatch => {
    dispatch(requestResource(url, docType))
    return fetch(url)
      .then(response => response.text())
      .then(data => {
        // Resolve xincludes if present
        const doc = parser.parseFromString(data, 'text/xml')
        const xincludes = []
        for (const xinclude of doc.querySelectorAll('include')) {
          xincludes.push(new Promise((res) => {
            fetch(xinclude.getAttribute('href'))
              .then(response => response.text())
              .then(xiData => {
                const xiDataDoc = parser.parseFromString(xiData, 'text/xml')
                xinclude.parentNode.replaceChild(xiDataDoc.documentElement, xinclude)
                res()
              })
          }))
        }
        Promise.all(xincludes).then(() => dispatch(receiveResource(serializer.serializeToString(doc), docType)))
      })
  }
}

export function getCollation(url) {
  return dispatch => {
    dispatch(getResource(url, 'collation'))
      .then(() => dispatch(getCollationSources()))
  }
}

export function getVariants(app, lemma) {
  return dispatch => {
    const variants = []
    const promises = []
    for (const reading of Array.from(app.querySelectorAll('app > *'))) {
      if (reading.tagName === 'rdg') {
        const wit = reading.getAttribute('wit')
        const isLemma = wit === lemma ? true : false
        const sourceAndId = reading.children[0].getAttribute('target').split('#')
        if (wit !== '#fMS') { // Change this when you're ready to work on SGA pointers
          promises.push(
            fetch(sourceAndId[0])
              .then(response => response.text())
              .then(text => {
                const source = parser.parseFromString(text, 'text/xml')
                const variant = source.querySelector(`[*|id="${sourceAndId[1]}"]`)
                variants.push({
                  group: uuid(),
                  values: [
                    {
                      text: variant.textContent,
                      sourceUrl: sourceAndId[0],
                      wit,
                      isLemma
                    }
                  ]
                })
              })
          )
        }
      } else {
      //   const values = []
      //   for (const rdg of Array.from(reading.getElementsByTagName('rdg'))) {
      //     const wit = rdg.getAttribute('wit')
      //     const isLemma = wit === lemma ? true : false
      //     const sourceAndId = rdg.children[0].getAttribute('target').split('#')
      //     promises.push(
      //       fetch(sourceAndId[0])
      //         .then(response => response.text())
      //         .then(text => {
      //           const source = parser.parseFromString(text, 'text/xml')
      //           const variant = source.querySelector(`[*|id="${sourceAndId[1]}"]`)
      //           values.push({
      //             text: variant.textContent,
      //             sourceUrl: sourceAndId[0],
      //             wit,
      //             isLemma
      //           })
      //         })
      //     )
      //   }
      //   const group = reading.getAttribute('n') ? reading.getAttribute('n') : uuid()
      //   variants.push({ group, values })
      }
    }
    Promise.all(promises).then(() => {
      dispatch(setVariants(variants))
    })
  }
}