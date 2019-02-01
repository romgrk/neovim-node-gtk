/*
 * models.js
 */


class Token {
    constructor(text, attr) {
        this.text = text
        this.attr = attr
    }
}

class Line {
    constructor(length, tokens = []) {
        this.length = length
        this.tokens = tokens
    }

    getText() {
        const text = this.tokens.map(t => t.text).join('')
        const diff = this.length - text.length
        if (diff > 0)
            return text + ' '.repeat(diff)
        return text
    }

    append(token) {
        this.tokens.push(token)
    }

    slice(start, end) {
        const {startIndex, endIndex} = this._prepareSlice(start, end - start)

        return this.tokens.slice(startIndex, endIndex + 1)
    }

    insert(position, token) {
        const {startIndex, endIndex} = this._prepareSlice(position, token.text.length)
        const deleteCount = (endIndex + 1) - startIndex

        this.tokens.splice(startIndex, deleteCount, token)
    }

    insertTokens(position, tokens) {
        const length = tokens.reduce((length, t) => length + t.text.length, 0)
        const {startIndex, endIndex} = this._prepareSlice(position, length)
        const deleteCount = (endIndex + 1) - startIndex

        this.tokens.splice(startIndex, deleteCount, ...tokens)
    }

    clear(position = 0) {
        if (position === 0) {
            this.tokens.splice(0, this.tokens.length)
            return
        }

        const length = this.length - position
        const {startIndex, endIndex} = this._prepareSlice(position, length)
        const deleteCount = (endIndex + 1) - startIndex

        this.tokens.splice(startIndex, deleteCount)
    }

    _prepareSlice(position, length) {
        let index
        let startIndex
        let endIndex
        let currentToken
        let currentTokenEnd = 0
        let charCount = 0

        const positionEnd = position + length
        const positions = []

        // 012345678
        //   |--|
        // aaaabbbbcccc

        for (index = 0; index < this.tokens.length; index++) {
            positions.push(charCount)
            currentToken = this.tokens[index]
            currentTokenEnd = charCount + currentToken.text.length

            const isPastStart = charCount + currentToken.text.length - 1 >= position

            if (isPastStart && startIndex === undefined) {
                startIndex = index
            }

            if (isPastStart && isInRange(positionEnd, charCount, currentTokenEnd)) {
                endIndex = index
                break;
            }

            charCount += currentToken.text.length
        }

        // Insert token at or after the end of current tokens
        //        position
        //            |---->[1111]
        // [aaaa][bbbb]
        if (startIndex === undefined) {
            const diff = position - currentTokenEnd
            if (diff > 0) {
                this.tokens.push({ text: ' '.repeat(diff), attr: null })
            }
            return { startIndex: this.tokens.length, endIndex: this.tokens.length }
        }


        // Insert token over one or more tokens
        //     position         + length
        //         |--------------|
        // [aaaa][bbbbb][ccccc][ddddd]
        const startToken = this.tokens[startIndex]

        if (position > positions[startIndex]) {
            const breakPoint = position - positions[startIndex]
            const textBefore = startToken.text.slice(0, breakPoint)
            const textAfter  = startToken.text.slice(breakPoint)

            positions.splice(startIndex, 1, positions[startIndex], positions[startIndex] + textBefore.length)
            this.tokens.splice(startIndex, 1,
                { ...startToken, text: textBefore },
                { ...startToken, text: textAfter })

            startIndex += 1
            if (endIndex !== undefined)
                endIndex += 1
        }

        if (endIndex === undefined) {
            if (positionEnd >= charCount) {
                const diff = positionEnd - charCount
                if (diff > 0) {
                    this.tokens.push({ text: ' '.repeat(diff), attr: null })
                }
            }
            endIndex = this.tokens.length - 1
        }
        else if (endIndex !== undefined) {
            const endToken = this.tokens[endIndex]
            const endTokenEnd = positions[endIndex] + endToken.text.length

            if (positionEnd < endTokenEnd) {
                const breakPoint = endToken.text.length - (endTokenEnd - positionEnd)
                const textBefore = endToken.text.slice(0, breakPoint)
                const textAfter  = endToken.text.slice(breakPoint)

                positions.splice(endIndex, 1, textBefore.length, textAfter.length)
                this.tokens.splice(endIndex, 1,
                    { ...endToken, text: textBefore },
                    { ...endToken, text: textAfter })
            }
        }

        return { startIndex, endIndex }
    }

    setLength(length) {
        if (this.length > length) {

            let index
            let charCount = 0

            for (index = 0; index < this.tokens.length; index++) {
                const token = this.tokens[index]
                const tokenLength = token.text.length
                const tokenEnd = charCount + tokenLength - 1

                if (isInRange(length, charCount, tokenEnd)) {
                    if (length > charCount) {
                        const breakPoint = length - charCount
                        const textBefore = token.text.slice(0, breakPoint)
                        const textAfter  = token.text.slice(breakPoint)

                        this.tokens.splice(index, 1,
                            { ...token, text: textBefore },
                            { ...token, text: textAfter })
                        index += 1
                    }
                    this.tokens.splice(index, this.tokens.length - index)
                    break
                }

                charCount += tokenLength
            }
        }
        this.length = length
    }
}

class Screen extends Array {
    constructor(lines, cols) {
        super()
        this.lines = lines
        this.cols = cols

        for (let i = 0; i < lines; i++) {
            this.push(new Line(cols))
        }
    }

    resize(lines, cols) {
        if (lines < this.lines) {
            const index = this.lines - lines
            this.splice(index, this.length - index)
        }
        else if (lines > this.lines) {
            const diff = lines - this.lines
            for (let i = 0; i < diff; i++) {
                this.push(new Line(this.cols))
            }
        }

        if (cols !== this.cols) {
            this.forEach(line => {
                line.setLength(cols)
            })
        }

        this.lines = lines
        this.cols = cols
    }

    put(cursor, token) {
        const line = this[cursor.line]
        const tokens = JSON.parse(JSON.stringify(line.tokens))
        line.insert(cursor.col, token)
        if (line.getText().length > this.cols) {
            console.log('Screen.put', { cursor, token })
            console.log('Line', tokens)
            throw new Error('Invalid length')
        }
    }

    scroll(region, count) {
        console.log('scrolling')
        const top    = region.top
        const bottom = region.bottom + 1
        const left   = region.left
        const right  = region.right + 1
        const horizontalLength = right - left
        const verticalLength = bottom - top

        if (count > 0) {
            const destinationTop = top - count
            const destinationBottom = bottom - count

            for (let i = 0, line = destinationTop; line < destinationBottom; line++, i++) {
                if (line < top)
                    continue
                const sourceIndex = top + i
                const currentLine = this[line]
                const sourceLine = this[sourceIndex]
                const tokens = sourceLine ? sourceLine.slice(left, right) : [{ text: ' '.repeat(horizontalLength) }]
                currentLine.insertTokens(left, tokens)
            }
        }
        else /* if (count < 0) */ {
            const sourceTop = top + count
            const sourceBottom = bottom + count

            for (let i = 0, line = sourceBottom; line >= sourceTop; line--, i++) {
                const destinationIndex = line - count
                if (destinationIndex >= bottom || destinationIndex <= top)
                    continue
                const sourceLine = this[line]
                const destinationLine = this[destinationIndex]
                const tokens = sourceLine ? sourceLine.slice(left, right) : [{ text: ' '.repeat(horizontalLength) }]
                console.log({ i, line, sourceTop, sourceBottom })
                destinationLine.insertTokens(left, tokens)
            }
        }
        console.log('scrolled')
    }

    clearLine(line, col = 0) {
        this[line].clear(col)
    }

    clearAll() {
        for (let i = 0; i < this.length; i++) {
            this[i].clear()
        }
    }

    getTokenAt(lnum, col) {
        const line = this[lnum]
        return line.slice(col, col + 1)[0]
    }

    getText(cursor) {
        let text = (
            '   ╭' + '─'.repeat(this.cols) + '╮\n'
          + this.map((line, i) =>
                String(i).padEnd(2, ' ') + ' │' + line.getText() + '│').join('\n')
          + '\n   ╰' + '─'.repeat(this.cols) + '╯\n'
        )
        if (cursor) {
            const index = (cursor.line + 1) * (this.cols + 6) + cursor.col + 4
            text = text.slice(0, index) + '█' + text.slice(index + 1)
        }
        return text
    }
}

// Helpers

function isInRange(position, start, end) {
    return position >= start && position <= end
}

module.exports = { Token, Line, Screen }
