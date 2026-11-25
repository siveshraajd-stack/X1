import { redirect } from 'next/navigation';

// Employees and managers cannot edit profile details.
export default function EditProfilePage() {
    redirect('/profile');
}
