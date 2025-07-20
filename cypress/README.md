# End-to-End Testing with Cypress

This directory contains comprehensive end-to-end tests for GameCompare.ai, covering all critical user workflows and ensuring 95% scenario coverage.

## Test Structure

### Core Test Files

1. **chat-workflow.cy.ts** - Complete chat interface functionality
   - Basic chat interactions
   - Message persistence
   - Error handling
   - Loading states
   - Keyboard shortcuts

2. **game-recommendations.cy.ts** - Game discovery and filtering
   - Filter panel interactions
   - Game card display
   - Search result handling
   - Filter persistence

3. **affiliate-tracking.cy.ts** - Monetization workflow
   - Store link display
   - Click tracking
   - Affiliate URL generation
   - Revenue attribution

4. **responsive-design.cy.ts** - Mobile and responsive testing
   - Multiple viewport testing
   - Touch interactions
   - Orientation changes
   - Accessibility compliance

5. **performance.cy.ts** - Performance and Lighthouse testing
   - Page load metrics
   - Lighthouse audits
   - Memory usage
   - Network conditions

6. **critical-user-paths.cy.ts** - Complete user journeys
   - New user discovery
   - Comparison shopping
   - Mobile experience
   - Error recovery
   - Long session usage

## Test Coverage

### Requirements Coverage

- **1.1-1.5**: Chat functionality and AI integration ✅
- **2.1-2.4**: Game comparison features ✅
- **3.1-3.6**: Data ingestion (tested via API mocks) ✅
- **4.1-4.5**: Filtering and search ✅
- **5.1-5.3**: Affiliate tracking ✅
- **6.1-6.5**: Error handling and monitoring ✅
- **7.1-7.5**: Security and performance ✅

### User Scenarios (95% Coverage)

1. **New User Journey** (20%)
   - Landing page interaction
   - First chat message
   - Filter discovery
   - Game recommendations

2. **Comparison Shopping** (15%)
   - Game search
   - Comparison requests
   - Store link interactions
   - Purchase decisions

3. **Mobile Experience** (15%)
   - Responsive design
   - Touch interactions
   - Orientation changes
   - Mobile-specific features

4. **Advanced Filtering** (15%)
   - Complex filter combinations
   - Filter persistence
   - Filter clearing
   - Search refinement

5. **Error Recovery** (10%)
   - Network errors
   - API failures
   - User error handling
   - Graceful degradation

6. **Affiliate Conversion** (10%)
   - Click tracking
   - Store redirects
   - Revenue attribution
   - Multiple store support

7. **Long Session Usage** (5%)
   - Extended conversations
   - Performance maintenance
   - Memory management
   - Session persistence

8. **Accessibility** (5%)
   - Keyboard navigation
   - Screen reader support
   - Color contrast
   - ARIA compliance

## Running Tests

### Local Development
```bash
# Open Cypress Test Runner
npm run test:e2e:open

# Run all tests headlessly
npm run test:e2e:headless

# Run specific test file
npx cypress run --spec "cypress/e2e/chat-workflow.cy.ts"

# Run performance tests only
npm run test:performance
```

### CI/CD Pipeline
```bash
# Run all tests including unit and e2e
npm run test:all
```

## Test Data and Mocking

### API Mocking Strategy
- All external API calls are intercepted and mocked
- Realistic response data for consistent testing
- Error scenarios for resilience testing
- Performance simulation with delays

### Test Data
- Predefined game datasets for consistent results
- Various price points and platforms
- Different genres and ratings
- Store link configurations

## Performance Benchmarks

### Lighthouse Thresholds
- **Performance**: ≥90 (desktop), ≥85 (mobile)
- **Accessibility**: ≥90
- **Best Practices**: ≥90
- **SEO**: ≥90

### Custom Metrics
- First token response: <2 seconds
- Chat interaction: <3 seconds
- Filter application: <1 second
- Page load: <2 seconds

## Accessibility Testing

### WCAG 2.1 Compliance
- Level AA compliance
- Keyboard navigation
- Screen reader compatibility
- Color contrast ratios
- Focus management

### Testing Tools
- Built-in Cypress accessibility commands
- Custom accessibility assertions
- Keyboard navigation testing
- Color contrast validation

## Continuous Integration

### GitHub Actions Integration
```yaml
- name: Run E2E Tests
  run: |
    npm ci
    npm run build
    npm start &
    npm run test:e2e:headless
```

### Test Reporting
- Cypress Dashboard integration
- Screenshot and video capture
- Performance metrics tracking
- Coverage reporting

## Troubleshooting

### Common Issues

1. **Test Timeouts**
   - Increase command timeout in cypress.config.ts
   - Check for slow API responses
   - Verify network conditions

2. **Element Not Found**
   - Ensure data-cy attributes are present
   - Check for dynamic content loading
   - Verify viewport and responsive behavior

3. **Flaky Tests**
   - Add proper wait conditions
   - Use cy.intercept for API mocking
   - Implement retry logic for unstable elements

### Debug Mode
```bash
# Run with debug output
DEBUG=cypress:* npx cypress run

# Open DevTools in test runner
npx cypress open --config video=false
```

## Best Practices

### Test Writing
- Use data-cy attributes for element selection
- Mock all external dependencies
- Write descriptive test names
- Group related tests in describe blocks

### Maintenance
- Regular test review and updates
- Remove obsolete tests
- Update selectors when UI changes
- Monitor test execution times

### Performance
- Minimize test setup time
- Use efficient selectors
- Avoid unnecessary waits
- Optimize test data