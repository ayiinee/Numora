"""TEST ONLY. Rebuild with XlsxWriter 3.2.9; runtime/tests read the committed XLSX.
Uses a writer independent from ExcelJS and the application's OOXML extractor.
"""
import base64
import io
from pathlib import Path
import xlsxwriter

png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=')
with xlsxwriter.Workbook(Path(__file__).with_name('excel-v3-mixed.xlsx')) as workbook:
    for name in ('PG', 'MCMA', 'Kategori'):
        sheet = workbook.add_worksheet(name)
        # Deliberately reordered text/image headers, different from the app template.
        headers = ['img_A', 'alt_A', 'external_id', 'chapter_code', 'subchapter_code', 'competency_code', 'source_level', 'stem', 'img_stem', 'alt_stem', 'statement_A' if name == 'Kategori' else 'opt_A', 'statement_B' if name == 'Kategori' else 'opt_B', 'answer', 'explanation', 'img_explanation', 'alt_explanation', 'category_1', 'category_2', 'key_A', 'key_B']
        sheet.write_row(0, 0, headers)
        sheet.set_column(0, len(headers), 25)
        for row, mode in ((1, 'cell'), (4, 'floating')):
            values = {'external_id': f'TEST-{name}-{mode}', 'chapter_code': 'TEST-CH', 'subchapter_code': 'TEST-SC', 'competency_code': 'TEST-CP', 'source_level': 1, 'stem': 'TEST ONLY stem', 'opt_A': 'Dua', 'opt_B': 'Tiga', 'statement_A': 'Dua', 'statement_B': 'Tiga', 'answer': 'A,B' if name == 'MCMA' else 'A', 'explanation': 'TEST ONLY explanation', 'category_1': 'Benar', 'category_2': 'Salah', 'key_A': 'C1', 'key_B': 'C2'}
            sheet.set_row(row, 50)
            # Rich-value deduplication shares image metadata for identical bytes.
            values['alt_A'] = 'option'
            values['alt_explanation'] = 'explanation'
            for col, header in enumerate(headers):
                if header in values:
                    sheet.write(row, col, values[header])
            for column, description in (('img_stem', 'stem'), ('img_A', 'option'), ('img_explanation', 'explanation')):
                options = {'image_data': io.BytesIO(png), 'description': description}
                if mode == 'cell':
                    sheet.embed_image(row, headers.index(column), 'test-only.png', options)
                else:
                    sheet.insert_image(row, headers.index(column), 'test-only.png', {**options, 'x_offset': 15, 'y_offset': 12})
