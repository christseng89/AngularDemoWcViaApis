import { routes } from './app.routes';

describe('application routes', () => {
  it('matches Transaction Builder only at the exact root so Business Case Runner remains reachable', () => {
    const root = routes.find((route) => route.path === '');
    const businessCases = routes.find((route) => route.path === 'business-cases');

    expect(root).toMatchObject({ path: '', pathMatch: 'full' });
    expect(businessCases?.loadComponent).toEqual(expect.any(Function));
  });

  it('keeps the wildcard redirect last', () => {
    expect(routes.at(-1)).toEqual({ path: '**', redirectTo: '' });
  });
});
