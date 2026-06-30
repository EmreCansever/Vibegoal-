/**
 * Firebase Auth hata kodlarını resmi Türkçe hata mesajlarına çevirir.
 * 
 * @param {string|object} error - Hata kodu veya hata nesnesi
 * @returns {string} Resmi Türkçe hata mesajı
 */
export function getAuthErrorMessage(error) {
  const code = typeof error === 'string' ? error : (error?.code || '');

  switch (code) {
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi biçimi. Lütfen kontrol ediniz.';
    case 'auth/user-not-found':
      return 'Bu e-posta adresine ait bir hesap bulunamadı.';
    case 'auth/wrong-password':
      return 'Hatalı şifre girdiniz.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'E-posta veya şifre hatalı. Lütfen tekrar deneyiniz.';
    case 'auth/email-already-in-use':
      return 'Bu e-posta adresi zaten bir başka hesap tarafından kullanılmaktadır.';
    case 'auth/weak-password':
      return 'Şifre çok zayıf. Şifreniz en az 6 karakterden oluşmalıdır.';
    case 'auth/network-request-failed':
      return 'Bağlantı hatası oluştu. Lütfen internet bağlantınızı kontrol ediniz.';
    case 'auth/too-many-requests':
      return 'Çok fazla hatalı deneme yapıldı. Lütfen daha sonra tekrar deneyiniz.';
    case 'permission-denied':
      return 'Profil veritabanına erişim reddedildi. Giriş yapıldı ancak Firestore kurallarını kontrol edin.';
    case 'auth/requires-recent-login':
      return 'Bu işlem kritik bir güvenlik adımıdır. Lütfen oturumunuzu kapatıp tekrar giriş yaptıktan sonra tekrar deneyiniz.';
    case 'auth/user-mismatch':
      return 'Girilen kimlik bilgileri mevcut kullanıcı ile eşleşmemektedir.';
    case 'auth/user-disabled':
      return 'Bu kullanıcı hesabı askıya alınmıştır.';
    case 'auth/operation-not-allowed':
      return 'E-posta ile giriş Firebase konsolunda etkin değil. Lütfen yönetici ile iletişime geçiniz.';
    default:
      // Eğer bir hata kodu değil de düz Türkçe mock hata mesajı gelmişse (örn. boşluk barındıran string) onu koru
      if (typeof error === 'string') {
        if (error.startsWith('auth/') || (!error.includes(' ') && error.includes('-'))) {
          return 'Kimlik doğrulama işlemi sırasında bir hata oluştu. Lütfen tekrar deneyiniz.';
        }
        return error;
      }
      if (error && typeof error === 'object') {
        if (error.code?.startsWith('auth/')) {
          return 'Kimlik doğrulama işlemi sırasında bir hata oluştu. Lütfen tekrar deneyiniz.';
        }
        if (error.message) {
          return error.message;
        }
        if (error.code) {
          return 'Kimlik doğrulama işlemi sırasında bir hata oluştu. Lütfen tekrar deneyiniz.';
        }
      }
      return 'Kimlik doğrulama işlemi sırasında bir hata oluştu. Lütfen tekrar deneyiniz.';
  }
}
