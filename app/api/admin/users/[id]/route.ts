import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { requireAdminApi, errorResponse } from '@/lib/auth/api'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi()

  if (!auth.ok) {
    return auth.response
  }

  try {
    const { id } = await params
    const body = await request.json()
    const confirmEmail = body?.confirmEmail

    if (typeof confirmEmail !== 'string' || !confirmEmail) {
      return NextResponse.json(
        { error: 'Confirmation email is required' },
        { status: 400 }
      )
    }

    const { error } = await auth.context.supabase.rpc(
      'admin_delete_user',
      {
        p_user: id,
        p_confirm_email: confirmEmail,
      }
    )

    if (error) {
      return errorResponse(error, 'Failed to delete user')
    }

    return NextResponse.json({
      success: true,
      message: 'User account deleted successfully',
    })
  } catch (error) {
    console.error('Admin delete user error:', error)

    return errorResponse(
      error,
      'Unexpected error while deleting user'
    )
  }
}