import {
    Chapter,
    ChapterDetails,
    Tag,
    HomeSection,
    SourceManga,
    PartialSourceManga,
    TagSection,
    HomeSectionType
} from '@paperback/types'

import { decode as decodeHTMLEntity } from 'html-entities'
import { CheerioAPI } from 'cheerio'
const dayjs = require('dayjs')

export const parseMangaDetails = ($: CheerioAPI, mangaId: string): SourceManga => {
    console.log(` Parsing manga details for mangaId: ${mangaId} `)
    const titles: string[] = []

    titles.push(decodeHTMLEntity($('#top > section.flex > section > h1').first().text()?.trim() ?? ''))
    console.log(`Found title: ${titles.toString()}`)
    // currently not available alternative titles
    // const altTitles = $('h2.alternative-title.text1row', 'div.main-head').text().trim().split(',')
    // for (const title of altTitles) {
    //     titles.push(decodeHTMLEntity(title))
    // }

    const image = $('section:nth-child(3) > picture > img').attr('src') ?? ''
    const author = $('ul > li:nth-child(1) > span').text().trim();
    const description = decodeHTMLEntity($('section:nth-child(3) > ul > li > p').text().trim() ?? '');

    const arrayTags: Tag[] = []
    console.log(`Parsing tags ${$('#top > section > section > section > ul > li:nth-child(2) > span > a').toArray().length} for mangaId: ${mangaId}`)
    for (const tag of $('#top > section > section > section > ul > li:nth-child(2) > span > a').toArray()) {
        const label = $(tag).text().trim()
        const id = encodeURI($(tag).text().trim())

        if (!id || !label) continue
        arrayTags.push({ id: id, label: label })
    }
    console.log(`Found tags: ${arrayTags.map(x => x.label).join(', ')}`)
    const tagSections: TagSection[] = [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => App.createTag(x)) })]

    const rawStatus = $('section.hidden > ul > li:nth-child(4) > a').text().trim()
    let status = 'ONGOING'
    switch (rawStatus.toUpperCase()) {
        case 'ONGOING':
            status = 'Ongoing'
            break
        case 'COMPLETE':
            status = 'Completed'
            break
        case 'HIATUS':
            status = 'Hiatus'
            break
        case 'CANCELED':
            status = 'Canceled'
            break
        default:
            status = 'Ongoing'
            break
    }

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles: titles,
            image: image,
            status: status,
            author: author,
            artist: author,
            tags: tagSections,
            desc: description
        })
    })
}

export const parseChapters = async ($: CheerioAPI, mangaId: string): Promise<Chapter[]> => {
    console.log(`Parsing chapters for mangaId: ${mangaId}`)
    const chapters: Chapter[] = []
    let sortingIndex = 0
    //console.log('Parsing chapters for mangaId:', mangaId, 'with selector:', 'body > div > a > span.grow.flex.items-center.gap-2 > span:nth-child(1)')
    console.log(` Found chapters: ${$('body > div > a > span.grow.flex.items-center.gap-2 > span:nth-child(1)').length} `)
    for (const chapter of $('body > div > a > span.grow.flex.items-center.gap-2 > span:nth-child(1)').toArray()) {
        const chapterElement = $(chapter).parent().parent();
        const title = decodeHTMLEntity($(chapter).text().trim())
        const IDRegex = $(chapter).parent().parent().attr('href')?.replace(/\/$/, '').match("/chapters/(.*?)$");

        const chapterId = IDRegex && IDRegex[1] ? IDRegex[1] : ''
        if (!chapterId) continue

        const date = new Date(String($('time.text-datetime', chapterElement).attr('datetime')))
        const chapNumRegex = title.match("Chapter (.*?)$") || title.match("Episode (.*?)$")

        let chapNum = 0
        if (chapNumRegex && chapNumRegex[1]) {
            let chapRegex = chapNumRegex[1]
            if (chapRegex.includes('-')) chapRegex = chapRegex.replace('-', '.')
            chapNum = Number(chapRegex)
        }
        console.log(`Found chapter: ${title} with id: ${chapterId} and chapNum: ${chapNum}`)
        chapters.push({
            id: chapterId,
            name: `Chapter ${chapNum}`,
            langCode: '🇬🇧',
            chapNum: chapNum,
            time: date,
            sortingIndex,
            volume: 0,
            group: ''
        })
        sortingIndex--
    }

    if (chapters.length == 0) {
        throw new Error(`[DEBUG] Couldn't find any chapters for mangaId: ${mangaId}! with found chapters: ${$('body > div > a > span.grow.flex.items-center.gap-2 > span:nth-child(1)').length}`)
    }

    return chapters.map(chapter => {
        chapter.sortingIndex += chapters.length
        return App.createChapter(chapter)
    });
}
export const parseChapterDetails = async ($: CheerioAPI, mangaId: string, chapterId: string): Promise<ChapterDetails> => {
    console.log(`Parsing chapter details for mangaId: ${mangaId} chapterId: ${chapterId}`)
    const pages: string[] = []
    for (const img of $('body > section > img').toArray()) {
        let image = $(img).attr('src') ?? ''
        if (!image) image = $(img).attr('data-src') ?? ''
        if (!image) continue
        pages.push(image)
    }

    const chapterDetails = App.createChapterDetails({
        id: chapterId,
        mangaId: mangaId,
        pages: pages
    })
    return chapterDetails
}

export const parseHomeSections = ($: CheerioAPI, sectionCallback: (section: HomeSection) => void): void => {
    console.log('Parsing home sections')
    const mostViewedSection = App.createHomeSection({
        id: 'most_viewed',
        title: 'Most Viewed',
        containsMoreItems: true,
        type: HomeSectionType.singleRowLarge
    })

    const newSection = App.createHomeSection({
        id: 'new',
        title: 'New',
        containsMoreItems: true,
        type: HomeSectionType.singleRowNormal
    })

    const updateSection = App.createHomeSection({
        id: 'updated',
        title: 'Latest Updated',
        containsMoreItems: true,
        type: HomeSectionType.singleRowNormal
    })

    // Most Viewed
    const mostViewedSection_Array: PartialSourceManga[] = []
    for (const manga of $('body > main > section > section > article.flex').toArray()) {
        const title: string = $("div:nth-child(2) > a > div.truncate",manga).text()?.trim() ?? ''
        const IDRegex = $("div > a", manga).attr('href')?.replace(/\/$/, '').match("/series/(.*?)/")
        const id = IDRegex && IDRegex[1] ? IDRegex[1] : ''
        const image: string = $('img', manga).first().attr('src') ?? ''

        if (!id || !title) continue
        mostViewedSection_Array.push(App.createPartialSourceManga({
            image: image,
            title: decodeHTMLEntity(title),
            mangaId: id,
            subtitle: undefined
        }))
    }
    console.log(`Most Viewed Section Array: ${mostViewedSection_Array.length}`)
    mostViewedSection.items = mostViewedSection_Array
    sectionCallback(mostViewedSection)

    // New
    const newSection_Array: PartialSourceManga[] = []
    for (const manga of $('section:nth-child(3) > div > a').toArray()) {
        const title: string = $(manga).text().trim() ?? ''
        const IDRegex = $(manga).attr('href')?.replace(/\/$/, '').match("/series/(.*?)/")
        const id = IDRegex && IDRegex[1] ? IDRegex[1] : ''
        const image: string = `https://temp.compsci88.com/cover/fallback/${id}.jpg`

        if (!id || !title) continue
        newSection_Array.push(App.createPartialSourceManga({
            image: image,
            title: decodeHTMLEntity(title),
            mangaId: id,
            subtitle: undefined
        }))
    }
    console.log(`New Section Array: ${newSection_Array.length}`)
    newSection.items = newSection_Array
    sectionCallback(newSection)

    // Updated
    const updateSection_Array: PartialSourceManga[] = []
    for (const manga of $('body > main > section > section > section > article').toArray()) {
        const image: string = $('img', manga).first().attr('src') ?? ''
        const title: string = $('a > div:nth-child(1) > div', manga)?.text().trim() ?? ''
        const IDRegex = $('a',manga).attr('href')?.replace(/\/$/, '').match("/series/(.*?)/")
        const id = IDRegex && IDRegex[1] ? IDRegex[1] : ''
        const subtitle: string = displayTime($('time', manga).first().text().trim()) ?? ''
        console.log(`Time: ${subtitle} for mangaId: ${id}`)
        if (!id || !title) continue
        updateSection_Array.push(App.createPartialSourceManga({
            image: image,
            title: decodeHTMLEntity(title),
            mangaId: id,
            subtitle: decodeHTMLEntity(subtitle + ' ago')
        }))
    }
    console.log('Updated Section Array:', updateSection_Array.length)
    updateSection.items = updateSection_Array
    sectionCallback(updateSection)
}

export const parseViewMore = ($: CheerioAPI): PartialSourceManga[] => {
    console.log('Parsing view more items')

    const manga: PartialSourceManga[] = []
    const collectedIds: string[] = []

    for (const obj of $('body > article > section:nth-child(1)').toArray()) {
        const image: string = $('img', obj).first().attr('src') ?? ''
        const title: string = $('a > article > div > div > div', obj).text()?.trim() ?? ''
        const IDRegex = $("a",obj).attr('href')?.replace(/\/$/, '').match("/series/(.*?)/")
        const id = IDRegex && IDRegex[1] ? IDRegex[1] : ''
        // const getChapter = $('div.novel-stats > strong', obj).text().trim()

        // const chapNumRegex = getChapter.match(/(\d+\.?\d?)+/)
        // let chapNum = 0
        // if (chapNumRegex && chapNumRegex[1]) chapNum = Number(chapNumRegex[1])


        if (!id || !title || collectedIds.includes(id)) continue
        
        manga.push(App.createPartialSourceManga({
            image: image,
            title: decodeHTMLEntity(title),
            mangaId: id,
            subtitle: undefined
        }))
        collectedIds.push(id)
    }

    return manga
}

export const parseTags = ($: CheerioAPI): TagSection[] => {
    console.log('Parsing tags');
    const arrayTags: Tag[] = []
    for (const tag of $('body > main > div > section > section:nth-child(8) > div > div.collapse-content > fieldset > label').toArray()) {
        const title = $("input[type=hidden]", tag).attr('value') ?? ''

        if (!title) continue
        arrayTags.push({ id: title, label: title })
    }
    const tagSections: TagSection[] = [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => App.createTag(x)) })]
    return tagSections
}

export const parseSearch = ($: CheerioAPI): PartialSourceManga[] => {
    console.log('Parsing search results')
    const mangas: PartialSourceManga[] = []
    const collectedIds: string[] = []
    for (const obj of $('body > article > section:nth-child(1)').toArray()) {

        let image: string = $('picture > img', obj).first().attr('src') ?? ''
        //if (image.startsWith('/')) image = 'https://www.WeebCentral.net' + image

        const title: string = $('a > article > div > div > div', obj).text()?.trim() ?? ''
        const IDRegex = $("a", obj).attr('href')?.replace(/\/$/, '').match("/series/(.*?)/")
        const id = IDRegex && IDRegex[1] ? IDRegex[1] : ''
        console.log(`Found title: ${title} with id: ${id}`)

        // const getChapter = $('div.novel-stats > strong', obj).text().trim()
        // const chapNumRegex = getChapter.match(/(\d+\.?\d?)+/)

        // let chapNum = 0
        // if (chapNumRegex && chapNumRegex[1]) chapNum = Number(chapNumRegex[1])

        const subtitle = 'Chapter N/A'
        if (!id || !title || collectedIds.includes(id)) continue

        mangas.push(App.createPartialSourceManga({
            image: image,
            title: title,
            mangaId: id,
            subtitle: decodeHTMLEntity(subtitle)
        }))
    }
    return mangas
}

export const isLastPage = ($: CheerioAPI): boolean => {
    let isLast = false

    const pages = $('.mg-pagination-table').first().remove().text().trim().split(' / ')

    const currentPage = Number(pages[0])
    const lastPage = Number(pages[1])

    if (currentPage >= lastPage) isLast = true
    return isLast
}
export const isLastPageSearch = ($: CheerioAPI): boolean => {
    let isLast = false

    const pages = $('button[hx-get*="/search/data"]').first().text() ?? ''
    
    isLast = pages ? false : true
    return isLast
}
export const formatTagSearch = (tags: Tag[]): string => {
    if (!tags || tags.length === 0) return ''
    return `${tags?.map((x: Tag) => "included_tag=" + x.id + "&").join('')}`;
}
export const displayTime = (createdAt: string): string => {
    const now = dayjs();
    const createdTime = dayjs(createdAt);
    const minutes = now.diff(createdTime, 'minute');
    const hours = now.diff(createdTime, 'hour');
    const days = now.diff(createdTime, 'day');
    const currentYear = now.year();
    const commentYear = createdTime.year();
    if (minutes < 1) {
        return 'just now';
    } else if (hours < 1) {
        return `${minutes}m`;
    } else if (days < 1) {
        return `${hours}h`;
    } else if (days <= 2) {
        return `${days}d`;
    } else if (commentYear < currentYear) {
        return createdTime.format('MMM D, YYYY');
    } else {
        return createdTime.format('MMM D');
    }
}