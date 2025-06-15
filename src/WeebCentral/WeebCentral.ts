import {
    SourceManga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    ContentRating,
    Request,
    Response,
    TagSection,
    SourceIntents,
    ChapterProviding,
    MangaProviding,
    SearchResultsProviding,
    HomePageSectionsProviding,
    Tag
} from '@paperback/types'

import * as cheerio from 'cheerio'

import {
    parseChapterDetails,
    isLastPage,
    parseChapters,
    parseHomeSections,
    parseMangaDetails,
    parseViewMore,
    parseSearch,
    parseTags,
    isLastPageSearch,
    formatTagSearch
} from './WeebCentralParser'

const WC_DOMAIN = 'https://weebcentral.com'

export const WeebCentralInfo: SourceInfo = {
    version: '2.0.11',
    name: 'WeebCentral',
    icon: 'ic.png',
    author: 'Numby',
    authorWebsite: 'https://github.com/g2asell2019',
    description: 'Extension that pulls manga from weebcentral.com (former manga4life.com)',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: WC_DOMAIN,
    sourceTags: [],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class WeebCentral implements SearchResultsProviding, MangaProviding, ChapterProviding, HomePageSectionsProviding {

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}),
                    ...{
                        'referer': `${WC_DOMAIN}/`,
                        'user-agent': await this.requestManager.getDefaultUserAgent()
                    }
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    });

    getMangaShareUrl(mangaId: string): string { return `${WC_DOMAIN}/series/${mangaId}` }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}/series/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = cheerio.load(response.data as string)
        return parseMangaDetails($, mangaId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}/series/${mangaId}/full-chapter-list`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = cheerio.load(response.data as string)
        return await parseChapters($, mangaId)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}/chapters/${chapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = cheerio.load(response.data as string)
        return await parseChapterDetails($, mangaId, chapterId)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = cheerio.load(response.data as string)
        parseHomeSections($, sectionCallback)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        if (metadata?.completed) return metadata
        const offset: number = metadata?.offset ?? 0
        const limit: number = metadata?.limit ?? 32
        const page: number = metadata?.page ?? 1
        let param = ''

        switch (homepageSectionId) {
            case 'most_viewed':
                param = `search/data?limit=${limit}&offset=${offset}&author=&text=&sort=Popularity&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full%20Display`
                break
            case 'updated':
                param = `search/data?limit=${limit}&offset=${offset}&author=&text=&sort=Latest%20Updates&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full%20Display`
                break
            case 'new':
                param = `search/data?limit=${limit}&offset=${offset}&author=&text=&sort=Recently%20Added&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full%20Display`
                break
            default:
                throw new Error('Requested to getViewMoreItems for a section ID which doesn\'t exist')
        }
        const request = App.createRequest({
            url: `${WC_DOMAIN}/${param}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)
        const $ = cheerio.load(response.data as string)
        const manga = parseViewMore($)


        metadata = !isLastPageSearch($) ? { page: page + 1, offset: offset + limit, limit: limit } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const request = App.createRequest({
            url: `${WC_DOMAIN}/search`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        return parseTags($)
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const offset: number = metadata?.offset ?? 0
        const limit: number = metadata?.limit ?? 32
        const page: number = metadata?.page ?? 1
        let request

        console.log('Tag Search', query?.includedTags)
        let queryParam = ''
        // Regular search
        if (query.title) {
            queryParam = `${encodeURI(query.title)}&`

            // Tag Search
        } 

        request = App.createRequest({
                url: `${WC_DOMAIN}/search/data?limit=${limit}&offset=${offset}&author=&text=${queryParam}&${encodeURI(formatTagSearch(query?.includedTags))}sort=Best+Match&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full%20Display`,
                method: 'GET'
        })
        // else {
        //     console.log('Tag Search', query?.includedTags)

        //     request = App.createRequest({
        //         url: `${WC_DOMAIN}/search/data?limit=${limit}&offset=${offset}&${formatTagSearch(query?.includedTags)}sort=Best+Match&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full+Display`,
        //         method: 'GET'
        //     })
        // }

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        const manga = parseSearch($)
        console.log(`Is last page search ${isLastPageSearch($)}`);
        metadata = !isLastPageSearch($) ? { page: page + 1, offset: offset + limit, limit: limit } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }

    CloudFlareError(status: number): void {
        if (status == 503 || status == 403) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${WeebCentral.name}> and press the cloud icon.`)
        }
    }

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: WC_DOMAIN,
            method: 'GET',
            headers: {
                'referer': `${WC_DOMAIN}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }
}
