import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import { run, getRow } from '../db/database.js';
export function setupPassport() {
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await getRow('SELECT * FROM users WHERE id = $1', [id]);
            done(null, user ?? null);
        }
        catch (err) {
            done(err, null);
        }
    });
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL = process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/auth/google/callback';
    if (clientID && clientSecret) {
        passport.use(new GoogleStrategy({ clientID, clientSecret, callbackURL }, async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error('No email from Google profile'), undefined);
                }
                let user = await getRow('SELECT * FROM users WHERE google_id = $1', [profile.id]);
                if (!user) {
                    user = await getRow('SELECT * FROM users WHERE email = $1', [email]);
                }
                if (user) {
                    await run('UPDATE users SET google_id = $1, name = $2, avatar_url = $3, updated_at = NOW() WHERE id = $4', [profile.id, profile.displayName, profile.photos?.[0]?.value ?? null, user.id]);
                }
                else {
                    const id = uuidv4();
                    await run('INSERT INTO users (id, google_id, email, name, avatar_url) VALUES ($1, $2, $3, $4, $5)', [id, profile.id, email, profile.displayName, profile.photos?.[0]?.value ?? null]);
                    user = await getRow('SELECT * FROM users WHERE id = $1', [id]);
                }
                done(null, user);
            }
            catch (err) {
                done(err, undefined);
            }
        }));
    }
    else {
        console.warn('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }
}
//# sourceMappingURL=auth.js.map