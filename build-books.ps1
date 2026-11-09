# build-books.ps1
# Extracts 'Harry Potter Fan Fiction - Book 1.docx' and 'Harry Potter Fan Fiction - Book 2 (WIP).docx'
# into a standalone 'books-data.js' file for the web reader app.

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Escape-Html([string]$text) {
    if (-not $text) { return "" }
    $t = $text.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
    # Convert any literal **bold** markdown left in text
    $t = [regex]::Replace($t, '\*\*(.+?)\*\*', '<strong>$1</strong>')
    return $t
}

function Parse-DocxBook {
    param(
        [string]$FilePath,
        [string]$BookId,
        [string]$BookTitle,
        [string]$BookSubtitle,
        [string]$Badge
    )

    $resolved = (Resolve-Path $FilePath).Path
    $fileInfo = Get-Item $resolved
    $zip = [System.IO.Compression.ZipFile]::OpenRead($resolved)
    $entry = $zip.GetEntry('word/document.xml')
    $reader = New-Object System.IO.StreamReader($entry.Open())
    [xml]$xml = $reader.ReadToEnd()
    $reader.Close()
    $zip.Dispose()

    $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

    $paras = $xml.SelectNodes('//w:p', $ns)
    $chapters = New-Object System.Collections.Generic.List[object]
    $currentChapter = $null
    $totalWords = 0

    foreach ($p in $paras) {
        $runs = $p.SelectNodes('.//w:r', $ns)
        if ($runs.Count -eq 0) { continue }

        $plainParts = New-Object System.Collections.Generic.List[string]
        $htmlParts = New-Object System.Collections.Generic.List[string]

        $pPrBold = $null -ne $p.SelectSingleNode('w:pPr/w:rPr/w:b', $ns)
        $pPrItalic = $null -ne $p.SelectSingleNode('w:pPr/w:rPr/w:i', $ns)

        foreach ($r in $runs) {
            $tNodes = $r.SelectNodes('w:t', $ns)
            $rText = ($tNodes | ForEach-Object { $_.InnerText }) -join ''
            if (-not $rText) { continue }
            $plainParts.Add($rText)

            $escaped = Escape-Html $rText
            $isBold = $pPrBold -or ($null -ne $r.SelectSingleNode('w:rPr/w:b', $ns))
            $isItalic = $pPrItalic -or ($null -ne $r.SelectSingleNode('w:rPr/w:i', $ns))

            if ($isBold -and $isItalic) {
                $htmlParts.Add("<strong><em>$escaped</em></strong>")
            } elseif ($isBold) {
                $htmlParts.Add("<strong>$escaped</strong>")
            } elseif ($isItalic) {
                $htmlParts.Add("<em>$escaped</em>")
            } else {
                $htmlParts.Add($escaped)
            }
        }

        $plainText = ($plainParts -join '').Trim()
        if (-not $plainText) { continue }

        # Skip document-level title header or LLM transition meta-lines
        if ($plainText -match '^(Harry Potter:\s*Fanfiction|Book 2:\s*The Next Generation)$') { continue }
        if ($plainText -match '^(Here is the (next chapter|continuation)|\[END OF CHAPTER\])') { continue }

        # Check if this paragraph is a Chapter heading
        if ($plainText -match '^(?:\*\*|\s)*Chapter\s+(\d+)\s*:\s*(.+?)(?:\*\*|\s)*$') {
            $origNum = [int]$Matches[1]
            $chapTitle = $Matches[2].Trim()
            $seqNum = $chapters.Count + 1

            $currentChapter = [ordered]@{
                num        = $seqNum
                origNum    = $origNum
                title      = $chapTitle
                wordCount  = 0
                paragraphs = New-Object System.Collections.Generic.List[string]
            }
            $chapters.Add($currentChapter)
            continue
        }

        if ($null -eq $currentChapter) {
            $currentChapter = [ordered]@{
                num        = 1
                origNum    = 1
                title      = "Prologue"
                wordCount  = 0
                paragraphs = New-Object System.Collections.Generic.List[string]
            }
            $chapters.Add($currentChapter)
        }

        # Merge adjacent strong/em tags for cleaner HTML
        $paraHtml = ($htmlParts -join '').Trim()
        $paraHtml = $paraHtml.Replace('</strong><strong>', '').Replace('</em><em>', '')

        # Count words
        $words = ($plainText -split '\s+' | Where-Object { $_ -ne '' }).Count
        $currentChapter.wordCount += $words
        $totalWords += $words

        # Check if scene divider
        if ($plainText -match '^(\*\s*\*\s*\*|---+|\~\~\~+)$') {
            $currentChapter.paragraphs.Add('<hr class="scene-break" />')
        } else {
            $currentChapter.paragraphs.Add($paraHtml)
        }
    }

    return [ordered]@{
        id           = $BookId
        title        = $BookTitle
        subtitle     = $BookSubtitle
        badge        = $Badge
        sourceFile   = $fileInfo.Name
        lastModified = $fileInfo.LastWriteTimeUtc.ToString("o")
        fileSize     = $fileInfo.Length
        wordCount    = $totalWords
        chapterCount = $chapters.Count
        chapters     = $chapters
    }
}

$rootDir = if ($PSScriptRoot) { $PSScriptRoot } else { $PWD.Path }

Write-Host "Extracting Book 1..."
$book1 = Parse-DocxBook `
    -FilePath (Join-Path $rootDir "Harry Potter Fan Fiction - Book 1.docx") `
    -BookId "book-1" `
    -BookTitle "Book 1: The Boy Who Was Loved" `
    -BookSubtitle "From Privet Drive to the Grand Alliance" `
    -Badge "Complete"

Write-Host "  -> Chapters: $($book1.chapterCount), Words: $($book1.wordCount)"

Write-Host "Extracting Book 2..."
$book2 = Parse-DocxBook `
    -FilePath (Join-Path $rootDir "Harry Potter Fan Fiction - Book 2 (WIP).docx") `
    -BookId "book-2" `
    -BookTitle "Book 2: The Next Generation" `
    -BookSubtitle "The Rise of the Pantheon & The New Era" `
    -Badge "Work in Progress"

Write-Host "  -> Chapters: $($book2.chapterCount), Words: $($book2.wordCount)"

$payload = [ordered]@{
    seriesTitle    = "The Harry Potter Chronicles"
    seriesSubtitle = "An Alternate Universe Saga"
    generatedAt    = (Get-Date).ToUniversalTime().ToString("o")
    books          = @($book1, $book2)
}

$json = $payload | ConvertTo-Json -Depth 10 -Compress
$jsContent = "window.BOOKS_DATA = $json;`n"
$outPath = Join-Path $rootDir "books-data.js"
[System.IO.File]::WriteAllText($outPath, $jsContent, [System.Text.Encoding]::UTF8)
Write-Host "Saved books-data.js ($(([System.IO.FileInfo]$outPath).Length) bytes)"
