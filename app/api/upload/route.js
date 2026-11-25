import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
// The extension is derived from the verified MIME type, never from the file name
const ALLOWED = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
};
// Expense bills may also be a PDF
const ALLOWED_RECEIPT = { ...ALLOWED, 'application/pdf': 'pdf' };

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const rawType = formData.get('type');
        const type = rawType === 'logo' ? 'logo' : rawType === 'receipt' ? 'receipt' : rawType === 'document' ? 'document' : 'profile';

        // Company logos are uploaded during sign-up (no account yet); everything else needs a login
        if (type !== 'logo') {
            const session = await getServerSession(authOptions);
            if (!session) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        const extension = (type === 'receipt' || type === 'document' ? ALLOWED_RECEIPT : ALLOWED)[file.type];
        if (!extension) {
            return NextResponse.json(
                { error: type === 'receipt' || type === 'document' ? 'Only PNG, JPG, WEBP, GIF or PDF files are allowed' : 'Only PNG, JPG, WEBP or GIF images are allowed' },
                { status: 400 }
            );
        }
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'File must be 5MB or smaller' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadDir = type === 'logo' ? 'logos' : type === 'receipt' ? 'receipts' : type === 'document' ? 'documents' : 'profiles';
        const uploadsPath = join(process.cwd(), 'public', 'uploads', uploadDir);
        await mkdir(uploadsPath, { recursive: true });

        const filename = `${randomUUID()}.${extension}`;
        await writeFile(join(uploadsPath, filename), buffer);

        return NextResponse.json(
            { message: 'File uploaded successfully', url: `/uploads/${uploadDir}/${filename}` },
            { status: 200 }
        );
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }
}
